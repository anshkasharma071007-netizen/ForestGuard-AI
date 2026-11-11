import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { translateText } from './translations'

const STORAGE_KEY = 'fga.lang'
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP'])
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']

const LanguageContext = createContext({ lang: 'en', setLang: () => {} })

export function useLanguage() {
  return useContext(LanguageContext)
}

function isSkipped(element) {
  if (!element) return true
  if (SKIP_TAGS.has(element.tagName)) return true
  return Boolean(element.closest?.('[data-no-i18n]'))
}

function translateNode(node) {
  const current = node.nodeValue
  if (!current || !current.trim()) return
  const state = node.__fgaI18n
  const source = state && current === state.out ? state.src : current
  const out = translateText(source)
  node.__fgaI18n = { src: source, out }
  if (node.nodeValue !== out) node.nodeValue = out
}

function translateAttribute(element, name) {
  const current = element.getAttribute(name)
  if (!current) return
  const store = element.__fgaAttrs || (element.__fgaAttrs = {})
  const state = store[name]
  const source = state && current === state.out ? state.src : current
  const out = translateText(source)
  store[name] = { src: source, out }
  if (out !== current) element.setAttribute(name, out)
}

function translateTree(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!isSkipped(node.parentElement) && node.nodeValue && node.nodeValue.trim()) {
      translateNode(node)
    }
    node = walker.nextNode()
  }
  const attrSelector = ATTRS.map((attr) => `[${attr}]`).join(',')
  if (root.matches?.(attrSelector)) {
    for (const attr of ATTRS) {
      if (root.hasAttribute(attr)) translateAttribute(root, attr)
    }
  }
  root.querySelectorAll(attrSelector).forEach((element) => {
    if (isSkipped(element)) return
    for (const attr of ATTRS) {
      if (element.hasAttribute(attr)) translateAttribute(element, attr)
    }
  })
}

function restoreTree(root) {
  if (!root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const state = node.__fgaI18n
    if (state && node.nodeValue !== state.src) node.nodeValue = state.src
    if (state) delete node.__fgaI18n
    node = walker.nextNode()
  }
  const elements = root.querySelectorAll?.('[placeholder], [title], [aria-label], [alt]') || []
  elements.forEach((element) => {
    const store = element.__fgaAttrs
    if (!store) return
    for (const [attr, state] of Object.entries(store)) {
      if (element.getAttribute(attr) === state.out) element.setAttribute(attr, state.src)
    }
    delete element.__fgaAttrs
  })
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'
    } catch {
      return 'en'
    }
  })
  const observerRef = useRef(null)

  const setLang = useCallback((next) => {
    const value = next === 'hi' ? 'hi' : 'en'
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* storage may be unavailable; the session still switches */
    }
    setLangState(value)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en'

    if (lang !== 'hi') {
      observerRef.current?.disconnect()
      observerRef.current = null
      restoreTree(document.body)
      return undefined
    }

    translateTree(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement
          if (!isSkipped(parent)) translateNode(mutation.target)
        } else if (mutation.type === 'attributes') {
          if (!isSkipped(mutation.target)) translateAttribute(mutation.target, mutation.attributeName)
        } else {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              if (!isSkipped(node.parentElement)) translateNode(node)
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              translateTree(node)
            }
          })
        }
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    })
    observerRef.current = observer

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [lang])

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}
