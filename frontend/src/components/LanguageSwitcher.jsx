import { Languages } from 'lucide-react'
import { useLanguage } from '../i18n'

const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
]

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang, t } = useLanguage()
  return (
    <div
      className={`inline-flex items-center rounded-full border border-control-line-4 bg-parchment/70 p-0.5 ${className}`}
      role="group"
      aria-label={t('Language')}
    >
      <Languages className="ml-1.5 mr-0.5 hidden h-3 w-3 text-muted-9 sm:block" aria-hidden="true" />
      {OPTIONS.map((option) => {
        const active = lang === option.code
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLang(option.code)}
            aria-pressed={active}
            lang={option.code}
            className={`rounded-full px-1.5 py-1 text-xs sm:px-2 font-semibold transition ${
              active ? 'bg-forest-800 text-lime' : 'text-secondary-15 hover:bg-hover-white'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
