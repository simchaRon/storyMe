import * as Speech from 'expo-speech';

/**
 * Does this device have a voice for the language? If the device does not tell us (empty list,
 * or an error), say yes and let the speech call itself fail with a message.
 */
export async function hasVoiceFor(lang: 'he' | 'en'): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (voices.length === 0) return true;
    // iOS says "he-IL", Android may say "he_IL" or "iw_IL" (old code for Hebrew).
    const wanted = lang === 'he' ? ['he', 'iw'] : ['en'];
    return voices.some((v) => wanted.some((w) => v.language.toLowerCase().replace('_', '-').startsWith(w)));
  } catch {
    return true;
  }
}
