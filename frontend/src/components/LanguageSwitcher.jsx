import { Languages } from 'lucide-react'
import { useLanguage } from '../i18n'

const OPTIONS = [
  { code: 'en', label: 'EN', title: 'English' },
  { code: 'hi', label: 'हिं', title: 'Hindi' },
]

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useLanguage()
  return (
    <div
      className={`inline-flex items-center rounded-full border border-[#ddd6c6] bg-parchment/70 p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      <Languages className="ml-1.5 mr-0.5 h-3 w-3 text-[#8b9188]" aria-hidden="true" />
      {OPTIONS.map((option) => {
        const active = lang === option.code
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLang(option.code)}
            aria-pressed={active}
            title={option.title}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
              active ? 'bg-forest-800 text-lime' : 'text-[#6f786e] hover:bg-white'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
