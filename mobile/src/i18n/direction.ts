import * as Updates from 'expo-updates';
import { DevSettings, I18nManager, Platform } from 'react-native';

export type Lang = 'en' | 'he';

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
];

export function isRtlLang(lang: Lang): boolean {
  return lang === 'he';
}

/**
 * Make the layout match the language.
 * - Web: set `dir` and `lang` on the page. It changes at once.
 * - iOS / Android: the native layout direction only changes after a restart.
 * Returns true when the user must restart the app to see the new direction.
 * This function does not restart the app. Call `restartApp()` for that.
 */
export function applyDirection(lang: Lang): boolean {
  const rtl = isRtlLang(lang);

  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    return false;
  }

  I18nManager.allowRTL(true); // always allowed, so other right-to-left text still works
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}

/**
 * Restart the app so a new native direction shows. Returns false when it could not restart
 * (then the screen tells the user to close and open the app).
 * Not yet verified on a real build: expo-updates may need EAS set up (see docs/flow-i18n-rtl.md).
 */
export async function restartApp(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      globalThis.location?.reload();
      return true;
    }
    if (__DEV__) {
      DevSettings.reload();
      return true;
    }
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}
