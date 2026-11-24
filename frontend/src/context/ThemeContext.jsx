import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const root = document.documentElement
  const [dark, setDark] = useState(() => root.dataset.theme === 'dark')

  function toggleTheme() {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
    // Apply all palette changes together before restoring interactive transitions.
    root.dataset.themeSwitching = ''
    root.dataset.theme = next
    root.getBoundingClientRect()
    delete root.dataset.themeSwitching
    setDark(next === 'dark')
    try {
      localStorage.setItem('fga.theme', next)
    } catch {
      // The theme still applies for the current session.
    }
  }

  return <ThemeContext.Provider value={{ dark, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
