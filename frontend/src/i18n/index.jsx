import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { formatDate, formatDateTime, timeAgo, compactNumber } from '../utils/format'
import { languageTools } from './translate.js'

const STORAGE_KEY = 'fga.lang'
const LanguageContext = createContext({ lang: 'en', setLang: () => {}, ...languageTools('en') })

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageProvider({ children }) {
  const [lang, updateLanguage] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'
    } catch {
      return 'en'
    }
  })

  const setLang = useCallback((next) => {
    const value = next === 'hi' ? 'hi' : 'en'
    updateLanguage(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Storage can be unavailable while the current session still switches.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({
    lang, setLang, ...languageTools(lang),
    date: (value, opts) => formatDate(value, opts, lang),
    dateTime: (value) => formatDateTime(value, lang),
    clockTime: (value) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      hour: 'numeric', minute: '2-digit', hour12: lang === 'en',
    }).format(new Date(value)).toUpperCase(),
    relativeTime: (value) => timeAgo(value, lang),
    number: (value) => compactNumber(value, lang),
  }), [lang, setLang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
