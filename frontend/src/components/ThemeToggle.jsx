import { Moon, Sun } from 'lucide-react'
import { useLanguage } from '../i18n'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { t } = useLanguage()
  const { dark, toggleTheme } = useTheme()
  const Icon = dark ? Sun : Moon
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      className="btn-outline h-8 w-8 shrink-0 !rounded-full !p-0"
      onClick={toggleTheme}
      aria-label={t(label)}
      title={t(label)}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
