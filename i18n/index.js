import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import fr from '../locales/fr.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import it from '../locales/it.json';

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'it'];
export const FALLBACK_LANGUAGE = 'fr';
export const LANGUAGE_STORAGE_KEY = '@invader_language';

function getDeviceLocale() {
  const code = Localization.getLocales()?.[0]?.languageCode ?? FALLBACK_LANGUAGE;
  return SUPPORTED_LANGUAGES.includes(code) ? code : FALLBACK_LANGUAGE;
}

export function getDeviceLanguage() {
  return getDeviceLocale();
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
      it: { translation: it },
    },
    lng: getDeviceLocale(),
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: { escapeValue: false },
  });

export async function applyLanguage(lang) {
  const resolved =
    !lang || lang === 'system'
      ? getDeviceLocale()
      : SUPPORTED_LANGUAGES.includes(lang)
        ? lang
        : FALLBACK_LANGUAGE;
  if (i18n.language !== resolved) {
    await i18n.changeLanguage(resolved);
  }
}

export default i18n;
