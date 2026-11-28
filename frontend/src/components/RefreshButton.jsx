import { useLanguage } from '../i18n'
import { RefreshCw } from 'lucide-react'

export default function RefreshButton({ onClick, loading, label = 'Refresh' }) {
  const { t } = useLanguage()
  return <button type="button" className="operations-refresh" onClick={onClick} disabled={loading} aria-label={t(label)}
    aria-busy={loading} title={t(label)}>
    <RefreshCw size={15} className={loading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
    <span>{t('Refresh')}</span>
  </button>
}
