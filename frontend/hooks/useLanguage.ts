import { useTranslation } from 'react-i18next';

import type { Language } from '@/types';

/** 'ro' | 'en' for backend calls that return translated names. */
export function useLanguage(): Language {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith('ro') ? 'ro' : 'en';
}
