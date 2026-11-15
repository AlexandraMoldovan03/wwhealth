/**
 * i18n — i18next + react-i18next (works in Expo Go).
 *
 *   const { t } = useTranslation();   t('settings.title')       // in components (re-renders on change)
 *   import { i18n } from './.';    i18n.t('validation.x')    // in plain functions
 *
 * Language: the user's saved choice; otherwise the phone language when it is Romanian or English; otherwise English.
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

const STORAGE_KEY = 'wwhealth.language';
const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.code === value);

/** Phone language → 'ro' | 'en' (any other language falls back to English). */
export function deviceLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (isLanguage(code)) return code;
    }
  } catch {
    // expo-localization unavailable (tests): English
  }
  return 'en';
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ro: { translation: ro } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

/** The saved app language. */
export async function getLanguagePreference(): Promise<Language> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : deviceLanguage();
  } catch {
    return deviceLanguage();
  }
}

export async function setLanguagePreference(preference: Language): Promise<void> {
  await i18n.changeLanguage(preference);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice still applies for this session.
  }
}

// Apply the saved language at startup.
getLanguagePreference().then((preference) => {
  if (preference !== i18n.language) i18n.changeLanguage(preference);
});

/** Locale for dates/numbers (Intl), e.g. "ro-RO". */
export function currentLocale(): string {
  return i18n.language === 'ro' ? 'ro-RO' : 'en-GB';
}

export { i18n };
