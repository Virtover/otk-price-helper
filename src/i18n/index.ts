import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '../core/money';
import en from './en.json';
import pl from './pl.json';

export function initI18n(lang: Locale) {
  void i18n.use(initReactI18next).init({
    resources: { pl: { translation: pl }, en: { translation: en } },
    lng: lang,
    fallbackLng: 'pl',
    interpolation: { escapeValue: false },
    returnObjects: false,
  });
  return i18n;
}

export { i18n };
