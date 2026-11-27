import { CheckCircle2, ClipboardList, ShieldAlert, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorBox, Loading, PageHeader, RiskBadge, SectionTitle, StatCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { formatDateTime, titleCase } from '../utils/format'

const metrics = [
  ['pending', 'Pending reports', ClipboardList, '/reports?status=pending', 'amber'],
  ['active', 'Active incidents', Siren, '/alerts', 'forest'],
  ['high', 'High-risk active incidents', ShieldAlert, '/alerts?risk=high', 'clay'],
  ['resolved', 'Resolved incidents', CheckCircle2, '/alerts?status=resolved', 'slate'],
]

export default function Overview() {
  const { data, loading, error, reload } = useApi('/api/operations/dashboard', { interval: 6000 })
  return <>
    <PageHeader title="Dashboard" actions={<Link className="btn-outline" to="/map">Open incident map</Link>} />
    {error && <ErrorBox message={error} onRetry={reload} />}
    {!data && loading && <Loading />}
    {data && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([key, label, icon, link, tone]) => <Link key={key} to={link}>
          <StatCard label={label} icon={icon} value={data.summary[key]} tone={tone} />
        </Link>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <SectionTitle title="Pending review" action={<Link className="btn-outline" to="/reports?status=pending">Open queue</Link>} />
          {!data.pending.length && <EmptyState title="No reports awaiting review" />}
          <ul className="mt-3 divide-y divide-line-6">{data.pending.map((report) =>
            <li key={report.id} className="py-3">
              <Link className="font-semibold text-ink hover:underline" to={`/reports?report=${report.id}`}>{report.title}</Link>
              <div className="text-xs text-muted-3">{titleCase(report.category)} · {formatDateTime(report.created_at)}</div>
            </li>)}</ul>
        </section>
        <section className="card p-5">
          <SectionTitle title="Active alerts" action={<Link className="btn-outline" to="/alerts">Open alerts</Link>} />
          {!data.alerts.length && <EmptyState title="No active incident alerts" />}
          <ul className="mt-3 divide-y divide-line-6">{data.alerts.map((incident) =>
            <li key={incident.id} className="flex items-center justify-between gap-3 py-3">
              <div><Link className="font-semibold text-ink hover:underline" to={`/alerts?incident=${incident.id}`}>{incident.title}</Link>
                <div className="text-xs text-muted-3">{incident.species_name} · {incident.village_name || 'GPS location'}</div></div>
              <RiskBadge level={incident.severity} />
            </li>)}</ul>
        </section>
      </div>
      <section className="card p-5">
        <SectionTitle title="Recent activity" />
        {!data.activity.length && <EmptyState title="No citizen report activity" />}
        <ul className="mt-3 divide-y divide-line-6">{data.activity.map((event) =>
          <li key={`${event.id}-${event.kind}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <Link className="text-sm font-medium text-ink hover:underline"
              to={event.incident_id ? `/alerts?status=resolved&incident=${event.incident_id}` : `/reports?report=${event.id}`}>
              {event.title}
            </Link>
            <span className="text-xs text-muted-3">{event.kind} · {formatDateTime(event.at)}</span>
          </li>)}</ul>
      </section>
    </div>}
  </>
}
