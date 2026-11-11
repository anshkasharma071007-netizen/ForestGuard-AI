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
import { ActivityArea, BasisBars, CategoryBars, HourBars, RiskDonut, SpeciesBars } from '../components/charts'
import {
  Badge,
  DemoNotice,
  ErrorBox,
  Loading,
  PageHeader,
  RiskBadge,
  SectionTitle,
  StatCard,
} from '../components/ui'
import { SPECIES_COLOR, compactNumber, csvFilename, formatDateTime } from '../utils/format'

const WINDOWS = [
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
  [90, '90 days'],
]

export default function Analytics() {
  const [days, setDays] = useState(30)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const { data, loading, error, reload } = useApi(`/api/analytics?days=${days}`)

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
      const result = await api.get(`/api/analytics/export?days=${days}`, { responseType: 'blob' })
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
        eyebrow="Analytics & reports"
        title="Evidence you can review, export and defend"
        description="Detection trends, species composition, explainable risk drivers and response performance over a selectable window — with CSV and JSON exports for offline review."
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-[#dcd6c7] bg-white">
              {WINDOWS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(value)}
                  className={`px-2.5 py-2 text-[10.5px] font-semibold transition ${
                    days === value ? 'bg-forest-900 text-parchment' : 'text-[#7d867c] hover:bg-[#f4f0e6]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary !py-2" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
              Export CSV
            </button>
          </>
        }
      />

      <DemoNotice compact>
        <strong className="font-semibold">Synthetic analytics.</strong> Figures describe the demonstration dataset
        only. Response-time metrics are artefactual — they are produced by simulated acknowledgement and closure
        actions, not real field performance.
      </DemoNotice>

      {exportError && <ErrorBox message={exportError} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading label="Compiling analytics…" height="h-80" />
      ) : (
        data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Detections"
                value={compactNumber(totals.detections)}
                hint={`${totals.previous_detections} earlier records exist outside this window`}
                icon={PawPrint}
                tone="forest"
              />
              <StatCard
                label="High-risk share"
                value={`${highShare}%`}
                hint={`${totals.high_risk} of ${compactNumber(totals.detections)} records scored high risk`}
                icon={TriangleAlert}
                tone="clay"
              />
              <StatCard
                label="Alerts generated"
                value={totals.alerts}
                hint={`${totals.open_alerts} still open · ${response?.acknowledgement_rate ?? 0}% acknowledged`}
                icon={Siren}
                tone="amber"
              />
              <StatCard
                label="Inferred tracks"
                value={totals.tracked_sequences}
                hint="Camera-sequence associations — never GPS telemetry"
                icon={Radar}
                tone="slate"
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-8">
                <SectionTitle
                  title="Detection trend"
                  subtitle={`Daily detections over the ${data.window_days}-day window`}
                  action={<Badge tone="neutral">synthetic dataset</Badge>}
                />
                <div className="mt-3">
                  <ActivityArea data={data.timeline} height={252} />
                </div>
              </div>
              <div className="card p-5 xl:col-span-4">
                <SectionTitle title="Risk composition" subtitle="Explainable classification of the window" />
                <div className="mt-2">
                  <RiskDonut data={data.risk_distribution} height={188} />
                </div>
                <div className="mt-2 text-[9.5px] leading-relaxed text-[#8b9188]">
                  Risk is a prioritisation aid derived from proximity, recency, activity, verified incidents and —
                  only where a sequence supports it — movement evidence.
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle
                  title="Species composition"
                  subtitle="Validated classes, counts and average risk"
                  action={<span className="font-mono text-[10px] text-[#92988f]">{totalSignals} records</span>}
                />
                <div className="mt-3 overflow-x-auto">
                  <table className="data-table min-w-[520px]">
                    <thead>
                      <tr>
                        <th>Species</th>
                        <th>Records</th>
                        <th>Share</th>
                        <th>Avg. risk</th>
                        <th>High risk</th>
                        <th>Earlier records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {speciesRows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: SPECIES_COLOR[row.key] || '#64748B' }} />
                              <span className="text-[12px] font-semibold text-ink">{row.name}</span>
                            </div>
                          </td>
                          <td className="font-mono text-[11px]">{row.count}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#eae5d8]">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(100, row.share)}%`, background: SPECIES_COLOR[row.key] || '#64748B' }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-[#7d867c]">{row.share}%</span>
                            </div>
                          </td>
                          <td>
                            <RiskBadge
                              level={row.avg_risk >= 65 ? 'high' : row.avg_risk >= 35 ? 'moderate' : 'low'}
                              score={row.avg_risk}
                            />
                          </td>
                          <td className="font-mono text-[11px]">{row.high_risk}</td>
                          <td className="font-mono text-[11px] text-[#8b9188]">{row.previous_period}</td>
                        </tr>
                      ))}
                      {!speciesRows.length && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[12px] text-[#8a9187]">
                            No detections in this window.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-[9px] text-[#9a998e]">
                  “Earlier records” counts the same species before the selected window; it is a baseline count, not a
                  population estimate or growth rate.
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle title="Species distribution" subtitle="Records by validated class" />
                <div className="mt-3">
                  <SpeciesBars data={speciesRows} height={252} />
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-6">
                <SectionTitle title="Risk evidence basis" subtitle="How the explainable score is supported" />
                <div className="mt-3">
                  <BasisBars data={data.risk_basis} height={222} />
                </div>
                <div className="mt-2 text-[9.5px] leading-relaxed text-[#8b9188]">
                  Movement-supported records require a linked camera sequence. Proximity signals never claim that an
                  animal is approaching a village.
                </div>
              </div>
              <div className="card p-5 xl:col-span-6">
                <SectionTitle
                  title="Field incidents"
                  subtitle="Reported categories in the window"
                  action={<Badge tone="warning">{totals.incidents} incidents</Badge>}
                />
                <div className="mt-3">
                  <CategoryBars items={data.incidents.by_category} height={222} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.incidents.by_severity.map((row) => (
                    <Badge key={row.severity} tone={row.severity === 'high' ? 'danger' : row.severity === 'moderate' ? 'warning' : 'success'}>
                      {row.severity}: {row.count}
                    </Badge>
                  ))}
                  {!data.incidents.by_severity.length && <Badge tone="neutral">no incidents</Badge>}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle title="Diel activity" subtitle="Detection time-of-day across all species" />
                <div className="mt-3">
                  <HourBars data={data.hours} height={206} />
                </div>
                <div className="mt-2 text-[9.5px] leading-relaxed text-[#8b9188]">
                  Patterns reflect camera scheduling and synthetic behaviour, not a field behavioural study.
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle
                  title="Response performance"
                  subtitle="Simulated acknowledgement and closure times"
                  action={<Badge tone="neutral">{response?.resolved ?? 0} resolved</Badge>}
                />
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-[#5f695f]">Acknowledgement rate</span>
                      <span className="font-mono font-semibold text-ink">{response?.acknowledgement_rate ?? 0}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eae5d8]">
                      <div
                        className="h-full rounded-full bg-forest-500"
                        style={{ width: `${Math.min(100, response?.acknowledgement_rate ?? 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Avg. ack. time', response?.avg_ack_minutes != null ? `${response.avg_ack_minutes} min` : '—', Clock3],
                      ['Avg. closure', response?.avg_resolve_hours != null ? `${response.avg_resolve_hours} h` : '—', CheckCircle2],
                    ].map(([label, value, Icon]) => (
                      <div key={label} className="rounded-xl border border-[#e8e3d6] bg-[#f8f5ec] px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.1em] text-[#9a998e]">
                          <Icon className="h-3 w-3" /> {label}
                        </div>
                        <div className="mt-1 font-mono text-[15px] font-semibold text-ink">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Total', totals.alerts],
                      ['Open', totals.open_alerts],
                      ['Acknowledged', response?.acknowledged ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-[#ece7da] bg-white/60 px-2 py-1.5 text-center">
                        <div className="font-mono text-[13px] font-semibold text-ink">{value}</div>
                        <div className="text-[8px] uppercase tracking-[0.1em] text-[#9a998e]">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-[#f2eee2] px-2.5 py-2 text-[9px] leading-relaxed text-[#7d867c]">
                    Times are measured from synthetic alert creation to the demo acknowledgement or closure action.
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle title="Zone activity" subtitle="Detection records grouped by operational zone" />
                <div className="mt-3 overflow-x-auto">
                  <table className="data-table min-w-[420px]">
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th>Detections</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.zones.map((zone) => (
                        <tr key={zone.name}>
                          <td className="text-[12px] font-medium text-ink">{zone.name}</td>
                          <td className="font-mono text-[11px]">{zone.count}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#eae5d8]">
                                <div
                                  className="h-full rounded-full bg-forest-500"
                                  style={{ width: `${Math.min(100, (100 * zone.count) / Math.max(1, totals.detections))}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-[#7d867c]">
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
                  title="Camera network health"
                  subtitle="Registry status and busiest stations"
                  action={<Badge tone="forest">{data.cameras.online} online</Badge>}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="success">{data.cameras.online} online</Badge>
                  <Badge tone="warning">{data.cameras.maintenance} maintenance</Badge>
                  <Badge tone="danger">{data.cameras.offline} offline</Badge>
                </div>
                <div className="mt-3 space-y-1.5">
                  {data.cameras.top.map((camera) => (
                    <div key={camera.code} className="flex items-center gap-2 text-[10.5px]">
                      <span className="w-24 shrink-0 font-mono text-[9.5px] text-[#5f695f]">{camera.code}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eae5d8]">
                        <div
                          className="h-full rounded-full bg-forest-500"
                          style={{ width: `${Math.min(100, (100 * camera.detections) / Math.max(1, data.cameras.top[0]?.detections || 1))}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-[9.5px] text-[#7d867c]">{camera.detections}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-[#ece7da] pt-2 text-[9px] text-[#9a998e]">
                  {data.guards.total} guards recorded · {data.guards.available} available · {data.guards.on_patrol} on
                  patrol
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[#e8e3d6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="eyebrow">Report builder</div>
                  <h2 className="mt-1 font-display text-[19px] text-ink">Operational snapshot</h2>
                  <p className="mt-0.5 text-[11px] text-[#7a8379]">
                    Print this page or export the underlying records for a written briefing.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn-outline !py-2" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Print view
                  </button>
                  <button type="button" className="btn-outline !py-2" onClick={exportJson} disabled={!data}>
                    <FileText className="h-3.5 w-3.5" /> Download JSON
                  </button>
                  <button type="button" className="btn-primary !py-2" onClick={exportCsv} disabled={exporting}>
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Detection CSV
                  </button>
                </div>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-3">
                <div className="rounded-xl border border-[#e8e3d6] bg-[#f8f5ec] p-4 lg:col-span-2">
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9a998e]">
                    <BarChart3 className="h-3.5 w-3.5" /> Summary
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[#5f695f]">
                    In the {data.window_days}-day demonstration window, {totals.detections} wildlife detections were
                    recorded across {data.species.length} validated species. {totals.high_risk} records were classified
                    high risk and {totals.alerts} alerts were generated, of which {totals.open_alerts} remain open.{' '}
                    {totals.tracked_sequences} camera-sequence tracks were inferred. The busiest zone was{' '}
                    <span className="font-semibold text-ink">{data.zones[0]?.name || 'unavailable'}</span> with{' '}
                    {data.zones[0]?.count ?? 0} records.
                  </p>
                  <p className="mt-2 text-[9.5px] leading-relaxed text-[#8b9188]">
                    Generated {formatDateTime(data.generated_at)} from the Forest Guard AI demo database. All records
                    are synthetic; this snapshot must not be cited as field evidence or as proof of deployment.
                  </p>
                </div>
                <div className="rounded-xl border border-[#e8e3d6] bg-white/60 p-4">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9a998e]">Export contents</div>
                  <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-[#6f786e]">
                    <li>Detection CSV: timestamp, species, confidence, camera, coordinates, score, basis and source.</li>
                    <li>JSON summary: aggregates, charts series, incidents and response metrics.</li>
                    <li>No credentials or private datasets are included.</li>
                  </ul>
                  <div className="mt-3 flex items-center gap-1.5 text-[9px] text-[#92988f]">
                    <ShieldAlert className="h-3 w-3" /> Demonstration dataset · synthetic observations
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
