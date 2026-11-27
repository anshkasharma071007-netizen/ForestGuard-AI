import { RefreshCw } from 'lucide-react'

export default function RefreshButton({ onClick, loading, label = 'Refresh' }) {
  return <button type="button" className="operations-refresh" onClick={onClick} disabled={loading} aria-label={label}
    aria-busy={loading} title={label}>
    <RefreshCw size={15} className={loading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
    <span>Refresh</span>
  </button>
}
