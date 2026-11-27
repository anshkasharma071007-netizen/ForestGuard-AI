import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorBox, Loading, RiskBadge } from '../components/ui'
import RefreshButton from '../components/RefreshButton'
import { useApi } from '../hooks/useApi'
import { formatDateTime } from '../utils/format'

const metrics = [
  ['pending', 'Pending reports', '/reports?status=pending'],
  ['active', 'Active incidents', '/alerts'],
  ['high', 'High risk', '/alerts?risk=high'],
  ['resolved', 'Resolved', '/alerts?status=resolved'],
]

function DashboardList({ title, items, link, empty, children }) {
  return <section className="operations-panel px-4 py-3.5">
    <header className="flex items-center justify-between gap-3 border-b border-line-5 pb-3">
      <h2 className="font-semibold text-ink">{title}</h2>
      <Link className="operations-link" to={link} aria-label={`View all ${title.toLowerCase()}`}>View all</Link>
    </header>
    {items.length ? <ul className="mt-1 divide-y divide-line-6">{items.map(children)}</ul>
      : <p className="py-3 text-sm text-muted-3">{empty}</p>}
  </section>
}

export default function Overview() {
  const { data, loading, error, reload, updatedAt } = useApi('/api/operations/dashboard', { interval: 6000 })
  return <>
    <header className="operations-heading">
      <h1>Dashboard</h1>
      <div className="flex flex-wrap items-center gap-3">
        {updatedAt && <time className="text-xs text-muted-3" dateTime={updatedAt}>Updated {formatDateTime(updatedAt)}</time>}
        <RefreshButton onClick={reload} loading={loading} label="Refresh dashboard" />
      </div>
    </header>
    {error && <ErrorBox message={error} onRetry={reload} />}
    {!data && loading && <Loading label="Loading dashboard…" height="h-32" />}
    {data && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(([key, label, link]) => <Link className="operations-panel block px-3 py-3 hover:bg-raised sm:px-4" key={key} to={link}>
          <span className="block text-sm text-secondary-9">{label}</span>
          <strong className={`mt-1 block text-[28px] font-semibold leading-tight tabular-nums ${key === 'high' && data.summary[key] ? 'text-danger-2' : 'text-ink'}`}>
            {data.summary[key]}
          </strong>
        </Link>)}
      </div>
      <DashboardList title="Pending reports" items={data.pending} link="/reports?status=pending" empty="No pending reports">
        {report => <li key={report.id}>
          <Link className="operations-item" to={`/reports?report=${report.id}`}>
            <span className="operations-item-title"><strong>{report.title}</strong>
              <span className="block text-muted-3">{report.village_name || 'GPS location'}</span></span>
            <time dateTime={report.created_at} className="text-xs text-muted-3">{formatDateTime(report.created_at)}</time>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>}
      </DashboardList>
      <DashboardList title="Active incidents" items={data.alerts} link="/alerts" empty="No active incidents">
        {incident => <li key={incident.id}>
          <Link className="operations-item" to={`/alerts?incident=${incident.id}`}>
            <span className="operations-item-title"><strong>{incident.title}</strong>
              <span className="block text-muted-3">{incident.village_name || 'GPS location'}</span></span>
            <RiskBadge level={incident.severity} />
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>}
      </DashboardList>
    </div>}
  </>
}
