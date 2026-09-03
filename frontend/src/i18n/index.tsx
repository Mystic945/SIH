import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translations, type Dictionary, type Language } from './translations';

const STORAGE_KEY = 'agriqueue.lang';

interface I18nValue {
  lang: Language;
  t: Dictionary;
  setLang: (lang: Language) => void;
  toggle: () => void;
  /** Picks the right field from an object that carries both languages. */
  pick: (en?: string, hi?: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === 'en' || stored === 'hi') return stored;
    // Hindi first: it is the majority language of the target users.
    return navigator.language?.startsWith('en') ? 'en' : 'hi';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => setLangState(next), []);
  const toggle = useCallback(() => setLangState((prev) => (prev === 'en' ? 'hi' : 'en')), []);

  const pick = useCallback(
    (en?: string, hi?: string) => (lang === 'hi' ? hi || en || '' : en || hi || ''),
    [lang]
  );

  const value = useMemo<I18nValue>(
    () => ({ lang, t: translations[lang] as unknown as Dictionary, setLang, toggle, pick }),
    [lang, setLang, toggle, pick]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Convenience hook when a component only needs the dictionary. */
export function useT() {
  return useI18n().t;
}

export type { Language };
