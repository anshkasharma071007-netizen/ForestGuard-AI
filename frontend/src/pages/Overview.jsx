import { useLanguage } from '../i18n'
import { ChevronRight, ClipboardList, Map, ShieldAlert, TriangleAlert, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DetectionTable } from '../components/cards'
import { RiskDonut, TrendLine } from '../components/charts'
import { ErrorBox, Loading, RiskBadge, StatusBadge } from '../components/ui'
import RefreshButton from '../components/RefreshButton'
import { useApi } from '../hooks/useApi'


const metrics = [
  ['pending', 'Pending reports', '/reports?status=pending', ClipboardList],
  ['active', 'Active incidents', '/alerts', ShieldAlert],
  ['high', 'High risk', '/alerts?risk=high', TriangleAlert],
  ['resolved', 'Resolved', '/alerts?status=resolved', CheckCircle2],
]

function Panel({ title, description, link, children }) {
  const { t } = useLanguage()
  return <section className="operations-panel min-w-0 p-4 sm:p-5">
    <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-3">{description}</p>}
      </div>
      {link && <Link className="operations-link" to={link} aria-label={t('View all: {section}', { section: title })}>{t('View all')}</Link>}
    </header>
    {children}
  </section>
}

export default function Overview() {
  const { t, dateTime, term } = useLanguage()
  const { data, loading, error, reload, updatedAt } = useApi('/api/operations/dashboard', { interval: 6000 })
  return <>
    <header className="operations-heading">
      <h1>{t('Dashboard')}</h1>
      <div className="flex flex-wrap items-center gap-3">
        {updatedAt && <time className="text-xs text-muted-3" dateTime={updatedAt}>{t('Updated')} {dateTime(updatedAt)}</time>}
        <RefreshButton onClick={reload} loading={loading} label={t('Refresh dashboard')} />
        <Link className="btn-primary !py-2" to="/map"><Map size={16} />{t('Open map')}</Link>
      </div>
    </header>
    {error && <ErrorBox message={error} onRetry={reload} />}
    {!data && loading && <Loading label={t('Loading dashboard…')} height="h-32" />}
    {data && <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(([key, label, link, Icon]) => <Link className="operations-panel block p-4 hover:bg-raised" key={key} to={link}>
          <span className="flex items-center justify-between gap-2 text-sm font-semibold text-secondary-9">{t(label)}<Icon size={17} aria-hidden="true" /></span>
          <strong className={`mt-3 block font-display text-4xl leading-tight tabular-nums ${key === 'high' && data.summary[key] ? 'text-danger-2' : 'text-ink'}`}>
            {data.summary[key]}
          </strong>
        </Link>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(270px,2fr)]">
        <Panel title={t('Report and detection activity')} description={t('Daily records over the last 30 days')}>
          {data.daily.some(day => day.reports || day.detections) ? <>
            <p className="mb-2 flex flex-wrap gap-4 text-xs text-muted-3">
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--chart-green)]" />{t('Reports')}</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--chart-clay)]" />{t('Detections')}</span>
            </p>
            <TrendLine data={data.daily} dataKey="reports" name={t('Reports')} height={235}
              additionalSeries={{ dataKey: 'detections', name: t('Detections'), color: 'var(--chart-clay)' }} />
          </> : <p className="grid h-[255px] place-items-center rounded-lg border border-dashed border-line-5 text-sm text-muted-3">{t('No reports or detections in this date range.')}</p>}
        </Panel>
        <Panel title={t('Risk composition')} description={t('Severity of active verified incidents')}>
          <RiskDonut data={data.risk_distribution} height={205} unit="incidents" />
          {!data.summary.active && <p className="mt-2 text-center text-xs text-muted-3">{t('No active verified incidents.')}</p>}
        </Panel>
        <Panel title={t('Recent reports')} link="/reports">
          {data.recent_reports.length ? <div className="overflow-x-auto"><table className="data-table">
            <thead><tr><th>{t('Report')}</th><th>{t('Status')}</th><th>{t('Risk')}</th><th>{t('Submitted')}</th></tr></thead>
            <tbody>{data.recent_reports.map(report => <tr key={report.id}>
              <td><Link className="operations-link" to={`/reports?report=${report.id}`}>{report.title}</Link></td>
              <td><StatusBadge status={report.status} /></td>
              <td>{report.severity ? <RiskBadge level={report.severity} /> : '—'}</td>
              <td><time dateTime={report.created_at}>{dateTime(report.created_at)}</time></td>
            </tr>)}</tbody>
          </table></div> : <p className="py-3 text-sm text-muted-3">{t('No citizen reports in your coverage.')}</p>}
        </Panel>
        <Panel title={t('Priority alerts')} description={t('Open incidents ordered by severity')} link="/alerts">
          {data.alerts.length ? <ul className="divide-y divide-line-6">{data.alerts.map(incident => <li key={incident.id}>
            <Link className="operations-item" to={`/alerts?incident=${incident.id}`}>
              <span className="operations-item-title"><strong>{incident.title}</strong>
                <span className="block text-muted-3">{term('species', incident.species, incident.species_name)} · {incident.village_name || t('GPS location')}</span></span>
              <RiskBadge level={incident.severity} />
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </li>)}</ul> : <p className="py-3 text-sm text-muted-3">{t('No active alerts.')}</p>}
        </Panel>
        <div className="xl:col-span-2">
          <Panel title={t('Recent detections')} link="/wildlife">
            <DetectionTable items={data.recent_detections} emptyLabel={t('No detections in your coverage.')} />
          </Panel>
        </div>
      </div>
    </div>}
  </>
}
