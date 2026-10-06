import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getItem, setItem } from '../storage';
import { applyDirection, Lang } from './direction';
import en from './en.json';
import he from './he.json';

const LANG_KEY = 'dreamtale.lang';

function deviceLanguage(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === 'he' || code === 'iw' ? 'he' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, he: { translation: he } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  compatibilityJSON: 'v4',
});

/** Call once at app start. Uses the saved language, else the phone language. */
export async function initLanguage(): Promise<{ lang: Lang; restartNeeded: boolean }> {
  const saved = await getItem(LANG_KEY);
  const lang: Lang = saved === 'he' || saved === 'en' ? saved : deviceLanguage();
  await i18n.changeLanguage(lang);
  return { lang, restartNeeded: applyDirection(lang) };
}

/** Change language, remember it, and flip the layout direction. */
export async function setLanguage(lang: Lang): Promise<{ restartNeeded: boolean }> {
  await i18n.changeLanguage(lang);
  await setItem(LANG_KEY, lang);
  return { restartNeeded: applyDirection(lang) };
}

export default i18n;
