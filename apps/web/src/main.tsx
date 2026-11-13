import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/app.css';
import en from './locales/en.json';
import tr from './locales/tr.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import ar from './locales/ar.json';
import ja from './locales/ja.json';
import { App } from './app/App';
import { useApp } from './app/store';

// All translations are bundled locally: no cloud translation or remote resource is ever fetched.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr }, de: { translation: de }, fr: { translation: fr }, es: { translation: es }, ar: { translation: ar }, ja: { translation: ja } },
  lng: useApp.getState().settings.locale,
  fallbackLng: 'en',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React escapes rendered text; no HTML is ever injected from translations
  returnNull: false,
});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Offline cache: registered only in production builds. Updates wait until the user applies them (never mid-run).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('sw.js').catch(() => undefined); });
}
