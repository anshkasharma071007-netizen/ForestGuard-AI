import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { formatTimestamp } from '@/format';
import {
  localizedAdvisorySummary, localizedAdvisoryTitle, localizedError, termLabel, translator, type Language, type Term,
} from './translate';

const STORAGE_KEY = 'forest-guard.language';

function languageTools(language: Language) {
  const t = translator(language);
  return {
    t,
    term: (group: Term, value: string, fallback?: string) => termLabel(t, group, value, fallback),
    errorText: (message?: string | null) => localizedError(t, language, message ?? ''),
    dateTime: (value: string) => formatTimestamp(value, language),
    advisoryTitle: (title: string | undefined, animal: string) => localizedAdvisoryTitle(t, language, title, animal),
    advisorySummary: (summary?: string) => localizedAdvisorySummary(t, language, summary),
  };
}

const LanguageContext = createContext({
  ...languageTools('en'), language: 'en' as Language, ready: false, setLanguage: (_next: Language) => {},
});

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, updateLanguage] = useState<Language>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (active && stored === 'hi') updateLanguage('hi');
    }).catch(() => {}).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    updateLanguage(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ language, ready, setLanguage, ...languageTools(language) }), [language, ready, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
