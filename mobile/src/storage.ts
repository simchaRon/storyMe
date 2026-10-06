import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Small key-value helpers. A storage error never crashes the app: a failed read means "not saved".
// In development the error is printed, so a broken store is not silent.

function warn(action: string, e: unknown) {
  if (__DEV__) console.warn(`storage: ${action} failed`, e);
}

/** Safe, non-secret values (language). */
export async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    warn('read', e);
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    warn('write', e);
  }
}

/**
 * Secrets (login token). Secure store on phones. On web SecureStore does not exist, so the token
 * is in local storage. Any script on the page can read it, so keep the web app free of
 * third-party scripts. A safer web login (cookie) is a later task.
 */
export async function getSecret(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    warn('secret read', e);
    return null;
  }
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch (e) {
    warn('secret write', e);
  }
}
