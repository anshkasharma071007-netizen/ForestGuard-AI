import { ChevronRight, ClipboardList, Map, ShieldAlert, TriangleAlert, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DetectionTable } from '../components/cards'
import { RiskDonut, TrendLine } from '../components/charts'
import { ErrorBox, Loading, RiskBadge, StatusBadge } from '../components/ui'
import RefreshButton from '../components/RefreshButton'
import { useApi } from '../hooks/useApi'
import { formatDateTime } from '../utils/format'

const metrics = [
  ['pending', 'Pending reports', '/reports?status=pending', ClipboardList],
  ['active', 'Active incidents', '/alerts', ShieldAlert],
  ['high', 'High risk', '/alerts?risk=high', TriangleAlert],
  ['resolved', 'Resolved', '/alerts?status=resolved', CheckCircle2],
]

function Panel({ title, description, link, children }) {
  return <section className="operations-panel min-w-0 p-4 sm:p-5">
    <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-3">{description}</p>}
      </div>
      {link && <Link className="operations-link" to={link} aria-label={`View all ${title.toLowerCase()}`}>View all</Link>}
    </header>
    {children}
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
        <Link className="btn-primary !py-2" to="/map"><Map size={16} />Open map</Link>
      </div>
    </header>
    {error && <ErrorBox message={error} onRetry={reload} />}
    {!data && loading && <Loading label="Loading dashboard…" height="h-32" />}
    {data && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(([key, label, link, Icon]) => <Link className="operations-panel block p-4 hover:bg-raised" key={key} to={link}>
          <span className="flex items-center justify-between gap-2 text-sm font-semibold text-secondary-9">{label}<Icon size={17} aria-hidden="true" /></span>
          <strong className={`mt-3 block font-display text-4xl leading-tight tabular-nums ${key === 'high' && data.summary[key] ? 'text-danger-2' : 'text-ink'}`}>
            {data.summary[key]}
          </strong>
        </Link>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(270px,2fr)]">
        <Panel title="Report and detection activity" description="Daily records over the last 30 days">
          {data.daily.some(day => day.reports || day.detections) ? <>
            <p className="mb-2 flex flex-wrap gap-4 text-xs text-muted-3">
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--chart-green)]" />Reports</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--chart-clay)]" />Detections</span>
            </p>
            <TrendLine data={data.daily} dataKey="reports" name="Reports" height={235}
              additionalSeries={{ dataKey: 'detections', name: 'Detections', color: 'var(--chart-clay)' }} />
          </> : <p className="grid h-[255px] place-items-center rounded-lg border border-dashed border-line-5 text-sm text-muted-3">No reports or detections in this date range.</p>}
        </Panel>
        <Panel title="Risk composition" description="Severity of active verified incidents">
          <RiskDonut data={data.risk_distribution} height={205} unit="incidents" />
          {!data.summary.active && <p className="mt-2 text-center text-xs text-muted-3">No active verified incidents.</p>}
        </Panel>
        <Panel title="Recent reports" link="/reports">
          {data.recent_reports.length ? <div className="overflow-x-auto"><table className="data-table">
            <thead><tr><th>Report</th><th>Status</th><th>Risk</th><th>Submitted</th></tr></thead>
            <tbody>{data.recent_reports.map(report => <tr key={report.id}>
              <td><Link className="operations-link" to={`/reports?report=${report.id}`}>{report.title}</Link></td>
              <td><StatusBadge status={report.status} /></td>
              <td>{report.severity ? <RiskBadge level={report.severity} /> : '—'}</td>
              <td><time dateTime={report.created_at}>{formatDateTime(report.created_at)}</time></td>
            </tr>)}</tbody>
          </table></div> : <p className="py-3 text-sm text-muted-3">No citizen reports in your coverage.</p>}
        </Panel>
        <Panel title="Priority alerts" description="Open incidents ordered by severity" link="/alerts">
          {data.alerts.length ? <ul className="divide-y divide-line-6">{data.alerts.map(incident => <li key={incident.id}>
            <Link className="operations-item" to={`/alerts?incident=${incident.id}`}>
              <span className="operations-item-title"><strong>{incident.title}</strong>
                <span className="block text-muted-3">{incident.species_name} · {incident.village_name || 'GPS location'}</span></span>
              <RiskBadge level={incident.severity} />
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </li>)}</ul> : <p className="py-3 text-sm text-muted-3">No active alerts.</p>}
        </Panel>
        <div className="xl:col-span-2">
          <Panel title="Recent detections" link="/wildlife">
            <DetectionTable items={data.recent_detections} emptyLabel="No detections in your coverage." />
          </Panel>
        </div>
      </div>
    </div>}
  </>
}
