/**
 * i18n — i18next + react-i18next (works in Expo Go).
 *
 *   const { t } = useTranslation();   t('settings.title')       // in components (re-renders on change)
 *   import { i18n } from '@/i18n';    i18n.t('validation.x')    // in plain functions
 *
 * Language: saved preference (AsyncStorage) → phone language (expo-localization) → English.
 * Only UI text is translated — never user-entered medical data or technical values from the API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ro from './locales/ro.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ro', label: 'Română' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];
export type LanguagePreference = Language | 'system';

const STORAGE_KEY = 'wwhealth.language';
const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.code === value);

export function getDeviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode;
    return isLanguage(code) ? code : 'en';
  } catch {
    return 'en';
  }
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ro: { translation: ro } },
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

/** The saved choice ('system' = follow the phone). */
export async function getLanguagePreference(): Promise<LanguagePreference> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export async function setLanguagePreference(preference: LanguagePreference): Promise<void> {
  await i18n.changeLanguage(preference === 'system' ? getDeviceLanguage() : preference);
  try {
    if (preference === 'system') await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}

// Apply a saved choice at startup (overrides the phone language).
getLanguagePreference().then((preference) => {
  if (preference !== 'system' && preference !== i18n.language) i18n.changeLanguage(preference);
});

/** Locale for dates/numbers (Intl), e.g. "ro-RO". */
export function currentLocale(): string {
  return i18n.language === 'ro' ? 'ro-RO' : 'en-GB';
}

export { i18n };
