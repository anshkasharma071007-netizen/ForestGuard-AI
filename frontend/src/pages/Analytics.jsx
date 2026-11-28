import { useState } from 'react'
import {
  ArrowDownToLine,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  PawPrint,
  Printer,
  Radar,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../i18n'
import { ActivityArea, BasisBars, CategoryBars, HourBars, RiskDonut, SpeciesBars } from '../components/charts'
import {
  Badge,
  ErrorBox,
  Loading,
  PageHeader,
  RiskBadge,
  SectionTitle,
  StatCard,
} from '../components/ui'
import { SPECIES_COLOR, csvFilename } from '../utils/format'

const WINDOWS = [
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
  [90, '90 days'],
]

export default function Analytics() {
  const { t, number, dateTime, term } = useLanguage()
  const [days, setDays] = useState(30)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const { data, loading, error, reload } = useApi(`/api/analytics?days=${days}&operational=true`)

  const totals = data?.totals
  const response = data?.response
  const speciesRows = data?.species || []
  const totalSignals = speciesRows.reduce((sum, row) => sum + row.count, 0)
  const highShare = totals ? Math.round((100 * (totals.high_risk || 0)) / Math.max(1, totals.detections)) : 0

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const result = await api.get(`/api/analytics/export?days=${days}&operational=true`, { responseType: 'blob' })
      downloadBlob(result.data, csvFilename(result, `forest_guard_detections_${days}d.csv`))
    } catch (err) {
      setExportError(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const exportJson = () => {
    if (!data) return
    downloadBlob(
      new Blob([JSON.stringify({ exported_at: new Date().toISOString(), analytics: data }, null, 2)], {
        type: 'application/json',
      }),
      `forest_guard_summary_${days}d.json`,
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('Analytics & reports')}
        title={t('Evidence you can review, export and defend')}
        description={t('Detection trends, animal composition, explainable risk drivers and response performance over a selectable window — with CSV and JSON exports for offline review.')}
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-control-line-3 bg-raised">
              {WINDOWS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(value)}
                  className={`px-2.5 py-2 text-[10.5px] font-semibold transition ${
                    days === value ? 'bg-forest-900 text-brand-light' : 'text-muted-5 hover:bg-inset-2'
                  }`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary !py-2" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
              {t('Export CSV')}
            </button>
          </>
        }
      />

      {exportError && <ErrorBox message={exportError} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading label={t('Compiling analytics…')} height="h-80" />
      ) : (
        data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('Detections')}
                value={number(totals.detections)}
                hint={t('{count} earlier records exist outside this window', { count: totals.previous_detections })}
                icon={PawPrint}
                tone="forest"
              />
              <StatCard
                label={t('High-risk share')}
                value={`${highShare}%`}
                hint={t('{high} of {total} records scored high risk', { high: totals.high_risk, total: number(totals.detections) })}
                icon={TriangleAlert}
                tone="clay"
              />
              <StatCard
                label={t('Alerts generated')}
                value={totals.alerts}
                hint={t('{open} still open · {rate}% acknowledged', { open: totals.open_alerts, rate: response?.acknowledgement_rate ?? 0 })}
                icon={Siren}
                tone="amber"
              />
              <StatCard
                label={t('Inferred tracks')}
                value={totals.tracked_sequences}
                hint={t('Camera-sequence associations — never GPS telemetry')}
                icon={Radar}
                tone="slate"
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-8">
                <SectionTitle
                  title={t('Detection trend')}
                  subtitle={t('Daily detections over the {days}-day window', { days: data.window_days })}
                  action={<Badge tone="forest">{t('Landscape data')}</Badge>}
                />
                <div className="mt-3">
                  <ActivityArea data={data.timeline} height={252} />
                </div>
              </div>
              <div className="card p-5 xl:col-span-4">
                <SectionTitle title={t('Risk composition')} subtitle={t('Explainable classification of the window')} />
                <div className="mt-2">
                  <RiskDonut data={data.risk_distribution} height={188} />
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-muted-9">
                  {t('Risk is a prioritisation aid derived from proximity, recency, activity, verified incidents and — only where a sequence supports it — movement evidence.')}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle
                  title={t('Animal composition')}
                  subtitle={t('Validated classes, counts and average risk')}
                  action={<span className="font-mono text-[10px] text-muted-13">{totalSignals} {t('records')}</span>}
                />
                <div className="mt-3 overflow-x-auto">
                  <table className="data-table min-w-[520px]">
                    <thead>
                      <tr>
                        <th>{t('Animal')}</th>
                        <th>{t('Records')}</th>
                        <th>{t('Share')}</th>
                        <th>{t('Avg. risk')}</th>
                        <th>{t('High risk')}</th>
                        <th>{t('Earlier records')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {speciesRows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: SPECIES_COLOR[row.key] || '#64748B' }} />
                              <span className="text-[12px] font-semibold text-ink">{term('species', row.key, row.name)}</span>
                            </div>
                          </td>
                          <td className="font-mono text-[11px]">{row.count}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line-4">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(100, row.share)}%`, background: SPECIES_COLOR[row.key] || '#64748B' }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-muted-5">{row.share}%</span>
                            </div>
                          </td>
                          <td>
                            <RiskBadge
                              level={row.avg_risk >= 65 ? 'high' : row.avg_risk >= 35 ? 'moderate' : 'low'}
                              score={row.avg_risk}
                            />
                          </td>
                          <td className="font-mono text-[11px]">{row.high_risk}</td>
                          <td className="font-mono text-[11px] text-muted-9">{row.previous_period}</td>
                        </tr>
                      ))}
                      {!speciesRows.length && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[12px] text-muted-8">
                            {t('No detections in this window.')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-[10.5px] text-muted-16">
                  {t('“Earlier records” counts the same animal class before the selected window; it is a baseline count, not a population estimate or growth rate.')}
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle title={t('Animal distribution')} subtitle={t('Records by validated class')} />
                <div className="mt-3">
                  <SpeciesBars data={speciesRows} height={252} />
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-6">
                <SectionTitle title={t('Risk evidence basis')} subtitle={t('How the explainable score is supported')} />
                <div className="mt-3">
                  <BasisBars data={data.risk_basis} height={222} />
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-muted-9">
                  {t('Movement-supported records require a linked camera sequence. Proximity signals never claim that an animal is approaching a village.')}
                </div>
              </div>
              <div className="card p-5 xl:col-span-6">
                <SectionTitle
                  title={t('Field incidents')}
                  subtitle={t('Reported categories in the window')}
                  action={<Badge tone="warning">{totals.incidents} {t('incidents')}</Badge>}
                />
                <div className="mt-3">
                  <CategoryBars items={data.incidents.by_category} height={222} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.incidents.by_severity.map((row) => (
                    <Badge key={row.severity} tone={row.severity === 'high' ? 'danger' : row.severity === 'moderate' ? 'warning' : 'success'}>
                      {term('risk', row.severity)}: {row.count}
                    </Badge>
                  ))}
                  {!data.incidents.by_severity.length && <Badge tone="neutral">{t('no incidents')}</Badge>}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle title={t('Diel activity')} subtitle={t('Detection time-of-day across all animals')} />
                <div className="mt-3">
                  <HourBars data={data.hours} height={206} />
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-muted-9">
                  {t('Detection distribution patterns across the 24-hour cycle.')}
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle
                  title={t('Response performance')}
                  subtitle={t('Acknowledgement and closure times')}
                  action={<Badge tone="neutral">{response?.resolved ?? 0} {t('resolved')}</Badge>}
                />
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-secondary-8">{t('Acknowledgement rate')}</span>
                      <span className="font-mono font-semibold text-ink">{response?.acknowledgement_rate ?? 0}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-4">
                      <div
                        className="h-full rounded-full bg-forest-500"
                        style={{ width: `${Math.min(100, response?.acknowledgement_rate ?? 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [t('Avg. ack. time'), response?.avg_ack_minutes != null ? `${response.avg_ack_minutes} min` : '—', Clock3],
                      [t('Avg. closure'), response?.avg_resolve_hours != null ? `${response.avg_resolve_hours} h` : '—', CheckCircle2],
                    ].map(([label, value, Icon]) => (
                      <div key={label} className="rounded-xl border border-line-10 bg-inset-14 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-muted-16">
                          <Icon className="h-3 w-3" /> {t(label)}
                        </div>
                        <div className="mt-1 font-mono text-[15px] font-semibold text-ink">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      [t('Total'), totals.alerts],
                      [t('Open'), totals.open_alerts],
                      [t('Acknowledged'), response?.acknowledged ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-line-13 bg-raised/60 px-2 py-1.5 text-center">
                        <div className="font-mono text-[13px] font-semibold text-ink">{value}</div>
                        <div className="text-[10px] uppercase tracking-[0.1em] text-muted-16">{t(label)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-inset-1 px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-5">
                    {t('Times are measured from alert dispatch to recorded acknowledgement or resolution.')}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle title={t('Zone activity')} subtitle={t('Detection records grouped by operational zone')} />
                <div className="mt-3 overflow-x-auto">
                  <table className="data-table min-w-[420px]">
                    <thead>
                      <tr>
                        <th>{t('Zone')}</th>
                        <th>{t('Detections')}</th>
                        <th>{t('Share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.zones.map((zone) => (
                        <tr key={zone.name}>
                          <td className="text-[12px] font-medium text-ink">{zone.name}</td>
                          <td className="font-mono text-[11px]">{zone.count}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line-4">
                                <div
                                  className="h-full rounded-full bg-forest-500"
                                  style={{ width: `${Math.min(100, (100 * zone.count) / Math.max(1, totals.detections))}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-muted-5">
                                {Math.round((100 * zone.count) / Math.max(1, totals.detections))}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle
                  title={t('Camera network health')}
                  subtitle={t('Registry status and busiest stations')}
                  action={<Badge tone="forest">{data.cameras.online} {t('online')}</Badge>}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="success">{data.cameras.online} {t('online')}</Badge>
                  <Badge tone="warning">{data.cameras.maintenance} {t('maintenance')}</Badge>
                  <Badge tone="danger">{data.cameras.offline} {t('offline')}</Badge>
                </div>
                <div className="mt-3 space-y-1.5">
                  {data.cameras.top.map((camera) => (
                    <div key={camera.code} className="flex items-center gap-2 text-[10.5px]">
                      <span className="w-24 shrink-0 font-mono text-[11px] text-secondary-8">{camera.code}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-4">
                        <div
                          className="h-full rounded-full bg-forest-500"
                          style={{ width: `${Math.min(100, (100 * camera.detections) / Math.max(1, data.cameras.top[0]?.detections || 1))}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[11px] text-muted-5">{camera.detections}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-line-13 pt-2 text-[10.5px] text-muted-16">
                  {data.guards.total} {t('guards recorded ·')} {data.guards.available} {t('available ·')} {data.guards.on_patrol} {t('on patrol')}
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-line-10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="eyebrow">{t('Report builder')}</div>
                  <h2 className="mt-1 font-display text-[19px] text-ink">{t('Operational snapshot')}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-2">
                    {t('Print this page or export the underlying records for a written briefing.')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn-outline !py-2" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> {t('Print view')}
                  </button>
                  <button type="button" className="btn-outline !py-2" onClick={exportJson} disabled={!data}>
                    <FileText className="h-3.5 w-3.5" /> {t('Download JSON')}
                  </button>
                  <button type="button" className="btn-primary !py-2" onClick={exportCsv} disabled={exporting}>
                    <ArrowDownToLine className="h-3.5 w-3.5" /> {t('Detection CSV')}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-3">
                <div className="rounded-xl border border-line-10 bg-inset-14 p-4 lg:col-span-2">
                  <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-16">
                    <BarChart3 className="h-3.5 w-3.5" /> {t('Summary')}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-secondary-8">
                    {
                      t('In the {days}-day monitoring window, {detections} wildlife detections were recorded across {species} recognized animal classes. {high} records were classified high risk and {alerts} alerts were generated, of which {open} remain open. {tracks} camera-sequence tracks were inferred. The busiest zone was {zone} with {count} records.', {
                        days: data.window_days, detections: totals.detections, species: data.species.length,
                        high: totals.high_risk, alerts: totals.alerts, open: totals.open_alerts, tracks: totals.tracked_sequences,
                        zone: data.zones[0]?.name || t('Unavailable'), count: data.zones[0]?.count ?? 0,
                      })
                    }
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-9">
                    {t('Generated {time} from Van Saathi intelligence records.', { time: dateTime(data.generated_at) })}
                  </p>
                </div>
                <div className="rounded-xl border border-line-10 bg-raised/60 p-4">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-16">{t('Export contents')}</div>
                  <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-secondary-15">
                    <li>{t('Detection CSV: timestamp, animal, confidence, camera, coordinates, score, basis and source.')}</li>
                    <li>{t('JSON summary: aggregates, charts series, incidents and response metrics.')}</li>
                    <li>{t('No credentials or private datasets are included.')}</li>
                  </ul>
                  <div className="mt-3 flex items-center gap-1.5 text-[10.5px] text-muted-13">
                    <ShieldAlert className="h-3 w-3" /> {t('Operational records · landscape intelligence')}
                  </div>
                </div>
              </div>
            </section>
          </>
        )
      )}
    </div>
  )
}
