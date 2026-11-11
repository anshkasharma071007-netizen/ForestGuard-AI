import { useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crosshair,
  Loader2,
  RotateCcw,
  Save,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import api, { errorMessage, mediaUrl } from '../api/client'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import MapView from '../components/MapView'
import { AlertRow } from '../components/cards'
import {
  Badge,
  DemoNotice,
  ErrorBox,
  Loading,
  MetricBar,
  Modal,
  PageHeader,
  RiskBadge,
  SectionTitle,
  SpeciesTag,
  StatCard,
  StatusBadge,
} from '../components/ui'
import {
  confidencePercent,
  formatDateTime,
  speciesImage,
  titleCase,
} from '../utils/format'

const WORKFLOW = [
  'Detection',
  'Geolocation',
  'Risk analysis',
  'Village ID',
  'Alert',
  'Guard task',
  'Response',
]

const FIELD_META = [
  ['alert_threshold', 'Alert trigger score', 0, 100, '1'],
  ['alert_radius_km', 'Village alert radius (km)', 0.2, 25, '0.1'],
  ['influence_radius_km', 'Risk influence radius (km)', 0.5, 30, '0.1'],
  ['moderate', 'Moderate threshold', 0, 100, '1'],
  ['high', 'High threshold', 0, 100, '1'],
]

export default function RiskAlerts() {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useApi('/api/alerts?days=45&limit=200')
  const zones = useApi('/api/risk/zones?days=21')
  const config = useApi('/api/risk/config')
  const guards = useApi('/api/guards')
  const map = useApi('/api/map/layers?days=45')
  const [statusFilter, setStatusFilter] = useState('open')
  const [severity, setSeverity] = useState('')
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [form, setForm] = useState(null)
  const [note, setNote] = useState('')
  const [assignId, setAssignId] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [saveState, setSaveState] = useState(null)

  const detail = useApi(selectedAlert ? `/api/alerts/${selectedAlert.id}` : null, {
    enabled: Boolean(selectedAlert),
  })

  useEffect(() => {
    if (!config.data?.settings) return
    const settings = config.data.settings
    setForm({
      alert_threshold: settings.alert_threshold,
      alert_radius_km: settings.alert_radius_km,
      influence_radius_km: settings.influence_radius_km,
      moderate: settings.thresholds?.moderate ?? 35,
      high: settings.thresholds?.high ?? 65,
    })
  }, [config.data])

  const items = data?.items || []
  const openStatuses = ['active', 'acknowledged', 'responding']
  const filtered = useMemo(() => {
    return items.filter((alert) => {
      if (statusFilter === 'open' && !openStatuses.includes(alert.status)) return false
      if (statusFilter === 'resolved' && alert.status !== 'resolved') return false
      if (severity && alert.severity !== severity) return false
      return true
    })
  }, [items, statusFilter, severity])

  const openCount = items.filter((alert) => openStatuses.includes(alert.status)).length
  const highCount = items.filter((alert) => openStatuses.includes(alert.status) && alert.severity === 'high').length
  const zoneSummary = zones.data?.summary
  const exposure = zones.data?.villages || []
  const detailRecord =
    detail.data?.alert && detail.data.alert.id === selectedAlert?.id ? detail.data.alert : null
  const detailAlert = detailRecord || selectedAlert

  const openDetail = (alert) => {
    setSelectedAlert(alert)
    setNote('')
    setActionError(null)
    setAssignId(alert.assigned_guard?.id ? String(alert.assigned_guard.id) : '')
  }

  const act = async (action, payload = {}) => {
    if (!selectedAlert) return
    setBusy(true)
    setActionError(null)
    try {
      await api.post(`/api/alerts/${selectedAlert.id}/${action}`, { note: note || undefined, ...payload })
      await detail.reload()
      await reload()
      setNote('')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const assign = async () => {
    if (!assignId) {
      setActionError('Choose a guard to assign this alert.')
      return
    }
    await act('assign', { guard_id: Number(assignId) })
  }

  const saveConfig = async () => {
    if (!form) return
    setSaveState({ type: 'loading' })
    try {
      await api.patch('/api/risk/config', {
        alert_threshold: Number(form.alert_threshold),
        alert_radius_km: Number(form.alert_radius_km),
        influence_radius_km: Number(form.influence_radius_km),
        thresholds: { moderate: Number(form.moderate), high: Number(form.high) },
      })
      setSaveState({ type: 'ok', message: 'Configuration saved. All detections were re-scored.' })
      config.reload()
      zones.reload()
      reload()
      map.reload()
    } catch (err) {
      setSaveState({ type: 'error', message: errorMessage(err) })
    }
  }

  const resetConfig = async () => {
    setSaveState({ type: 'loading' })
    try {
      await api.post('/api/risk/config/reset')
      setSaveState({ type: 'ok', message: 'Defaults restored and detections re-scored.' })
      config.reload()
      zones.reload()
      reload()
      map.reload()
    } catch (err) {
      setSaveState({ type: 'error', message: errorMessage(err) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk & alert operations"
        title="Turn signals into timely, verified response"
        description="Inspect indicative risk zones, configure the scoring engine, and run the full alert lifecycle from acknowledgement to field closure."
        actions={
          <>
            <Badge tone="danger" dot>
              {openCount} open
            </Badge>
            {isAdmin && (
              <button type="button" className="btn-outline" onClick={resetConfig}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
              </button>
            )}
          </>
        }
      />

      <DemoNotice compact>
        <strong className="font-semibold">Synthetic alerts.</strong> Every alert is generated from the demo
        landscape. Risk scores are explainable prioritisation aids — not predictions of animal movement.
      </DemoNotice>

      <div className="card flex flex-wrap items-center gap-x-1.5 gap-y-2 px-4 py-3">
        <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9a998e]">Workflow</span>
        {WORKFLOW.map((step, index) => (
          <div key={step} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-full border border-[#e2ddce] bg-white/70 px-2 py-0.5 text-[9.5px] font-medium text-[#5f695f]">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-forest-900 font-mono text-[7.5px] text-lime">
                {index + 1}
              </span>
              {step}
            </span>
            {index < WORKFLOW.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-[#c1c5bb]" />}
          </div>
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open alerts" value={openCount} hint="Active, acknowledged and responding" icon={Siren} tone="clay" />
        <StatCard label="High priority" value={highCount} hint="Open alerts above the high threshold" icon={ShieldAlert} tone="amber" />
        <StatCard
          label="High-risk cells"
          value={zoneSummary?.high ?? '—'}
          hint={`${zoneSummary?.cells ?? '—'} indicative grid cells in 21 days`}
          icon={Crosshair}
          tone="forest"
        />
        <StatCard
          label="Villages exposed"
          value={exposure.filter((village) => village.level !== 'low').length}
          hint="Moderate or high exposure within the alert radius"
          icon={Users}
          tone="slate"
        />
      </section>

      {error && <ErrorBox message={error} onRetry={reload} />}

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="card overflow-hidden xl:col-span-8">
          <div className="flex flex-col gap-2 border-b border-[#e8e3d6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="eyebrow">Risk surface</div>
              <h2 className="mt-1 font-display text-[19px] text-ink">Indicative zones & alert coverage</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone="danger">high {zoneSummary?.high ?? 0}</Badge>
              <Badge tone="warning">moderate {zoneSummary?.moderate ?? 0}</Badge>
              <Badge tone="forest">low {zoneSummary?.low ?? 0}</Badge>
            </div>
          </div>
          {map.data ? (
            <MapView
              data={map.data}
              layers={{
                forest: true,
                villages: true,
                riskZones: true,
                alertCoverage: true,
                detections: true,
                tracks: true,
                cameras: false,
                incidents: true,
                guards: false,
              }}
              height="430px"
              onSelectDetection={() => {}}
              className="rounded-none border-0"
            />
          ) : (
            <div className="flex h-[430px] items-center justify-center text-[12px] text-[#8a9187]">
              Loading risk surface…
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e8e3d6] px-4 py-2.5 text-[9.5px] text-[#92988f]">
            <span>Zones combine recent signal strength with village exposure.</span>
            <span>Dashed circles = configurable alert radius</span>
          </div>
        </div>

        <div className="card p-5 xl:col-span-4">
          <SectionTitle
            title="Risk engine configuration"
            subtitle={isAdmin ? 'Admin — changes re-score the whole dataset' : 'Read-only for guard role'}
            action={<SlidersHorizontal className="h-4 w-4 text-[#9a998e]" />}
          />
          {config.loading && !config.data ? (
            <Loading height="h-64" />
          ) : config.error ? (
            <ErrorBox message={config.error} onRetry={config.reload} />
          ) : (
            form && (
              <div className="mt-3 space-y-2.5">
                {FIELD_META.map(([key, label, min, max, step]) => (
                  <div key={key}>
                    <label className="mb-1 flex items-center justify-between text-[10px] font-medium text-[#5f695f]">
                      {label}
                      <span className="font-mono text-[9.5px] text-[#9a998e]">
                        {key === 'alert_radius_km' || key === 'influence_radius_km' ? 'km' : 'score'}
                      </span>
                    </label>
                    <input
                      type="number"
                      className="field !py-1.5 !text-[12px]"
                      value={form[key]}
                      min={min}
                      max={max}
                      step={step}
                      disabled={!isAdmin}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </div>
                ))}
                <div className="rounded-lg border border-[#e8e3d6] bg-[#f7f4ea] px-2.5 py-2 text-[9px] leading-relaxed text-[#7d867c]">
                  Scores are computed from proximity (55%), recency (15%), recent activity (12%), verified incidents
                  (10%) and movement evidence (8%), scaled by species risk weight.
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary flex-1 !py-2" onClick={saveConfig} disabled={saveState?.type === 'loading'}>
                      {saveState?.type === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save & re-score
                    </button>
                    <button type="button" className="btn-outline !py-2" onClick={resetConfig} disabled={saveState?.type === 'loading'}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {saveState?.message && (
                  <div
                    className={`rounded-lg px-2.5 py-2 text-[9.5px] leading-relaxed ${
                      saveState.type === 'error'
                        ? 'border border-[#e6b9ac] bg-[#fbf0ec] text-[#8b3524]'
                        : 'border border-[#bcd6c2] bg-[#e7f2e9] text-[#245c3b]'
                    }`}
                  >
                    {saveState.message}
                  </div>
                )}
                <div className="rounded-lg bg-forest-900 px-2.5 py-2 text-[9px] leading-relaxed text-forest-100/70">
                  Changing thresholds affects both classification and alert generation. Existing alerts are not
                  deleted; the engine deduplicates within 24 hours.
                </div>
              </div>
            )
          )}
        </div>
      </section>

      <section className="card p-5">
        <SectionTitle
          title="Village exposure"
          subtitle="Maximum recent risk score within the alert radius plus 0.5 km"
          action={<Badge tone="neutral">14-day window</Badge>}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {exposure.map((village) => (
            <div key={village.id} className="rounded-xl border border-[#e8e3d6] bg-white/60 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[11.5px] font-semibold text-ink">{village.name}</div>
                <RiskBadge level={village.level} />
              </div>
              <div className="mt-1.5 flex items-end justify-between">
                <div>
                  <div className="font-mono text-[18px] font-semibold text-ink">{village.max_score}</div>
                  <div className="text-[8.5px] uppercase tracking-[0.1em] text-[#9a998e]">max score</div>
                </div>
                <div className="text-right text-[9px] text-[#8b9188]">
                  {village.detections_14d} signals
                  <br />
                  {village.top_species ? titleCase(village.top_species) : 'no dominant species'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <SectionTitle
          title="Alert management"
          subtitle="Acknowledge, assign, mark responding, and close with an audit trail"
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                ['open', 'Open'],
                ['resolved', 'Resolved'],
                ['all', 'All'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                    statusFilter === value
                      ? 'border-forest-600 bg-forest-50 text-forest-700'
                      : 'border-[#e0dacb] bg-white text-[#7d867c]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <select
                className="rounded-lg border border-[#dcd6c7] bg-white px-2 py-1 text-[10px] text-[#5f695f]"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="">All severities</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
              </select>
            </div>
          }
        />

        {loading && !data ? (
          <div className="mt-4">
            <Loading height="h-64" />
          </div>
        ) : (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {filtered.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onClick={() => openDetail(alert)} />
            ))}
            {!filtered.length && (
              <div className="col-span-full rounded-xl border border-dashed border-[#ddd7c8] px-4 py-12 text-center text-[12px] text-[#8a9187]">
                No alerts match this view. Try “All” or clear the severity filter.
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="card p-5 xl:col-span-6">
          <SectionTitle title="Guard roster" subtitle="Nearest available guard is auto-assigned on creation" />
          <div className="mt-3 space-y-1.5">
            {guards.data?.items?.map((guard) => (
              <div key={guard.id} className="flex items-center gap-3 rounded-lg border border-[#ece7da] bg-white/60 px-3 py-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-forest-50 text-[9.5px] font-bold text-forest-700">
                  {guard.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-semibold text-ink">{guard.name}</div>
                  <div className="text-[9.5px] text-[#8b9188]">
                    {guard.badge_id} · {guard.zone} · {guard.phone}
                  </div>
                </div>
                <Badge tone={guard.status === 'available' ? 'forest' : guard.status === 'on_patrol' ? 'warning' : 'neutral'}>
                  {titleCase(guard.status)}
                </Badge>
                <span className="font-mono text-[9px] text-[#92988f]">{guard.open_tasks} open</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5 xl:col-span-6">
          <SectionTitle title="Why a score, not a prediction" subtitle="The engine separates evidence types" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-[#e8e3d6] bg-[#f8f5ec] p-3">
              <div className="text-[11px] font-semibold text-ink">Proximity-based</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#7d867c]">
                A detection is near a village boundary. This raises attention but does not imply approach.
              </div>
            </div>
            <div className="rounded-xl border border-[#eccfc3] bg-[#fbf1ec] p-3">
              <div className="text-[11px] font-semibold text-[#8b3524]">Movement-supported</div>
              <div className="mt-1 text-[10px] leading-relaxed text-[#9a6a57]">
                A verified camera sequence indicates direction toward a village. Still inferred, never GPS.
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {config.data?.species?.map((species) => (
              <MetricBar
                key={species.key}
                label={`${species.name} · ${species.risk_label}`}
                value={Math.round(species.risk_weight * 100)}
                max={100}
                color={species.risk_weight >= 0.8 ? '#B83B2B' : species.risk_weight >= 0.5 ? '#D9A441' : '#2F7250'}
                suffix=" / 100 weight"
              />
            ))}
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={detailAlert ? `${detailAlert.species_name} alert` : 'Alert'}
        subtitle={detailAlert ? `Alert #${detailAlert.id} · ${detailAlert.severity} priority · ${formatDateTime(detailAlert.created_at)}` : ''}
        width="max-w-3xl"
        footer={
          detailAlert && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[9.5px] text-[#92988f]">
                {detailRecord?.is_simulated ? 'Synthetic demonstration alert.' : 'Generated from uploaded media.'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detailAlert.status !== 'resolved' && detailAlert.status !== 'responding' && (
                  <button type="button" className="btn-outline !py-2" onClick={() => act('respond')} disabled={busy}>
                    Mark responding
                  </button>
                )}
                {detailAlert.status !== 'resolved' && (
                  <button type="button" className="btn-primary !py-2" onClick={() => act('resolve')} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Resolve alert
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedAlert && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SpeciesTag species={detailAlert.species} name={detailAlert.species_name} color={detailAlert.color} />
              <StatusBadge status={detailAlert.status} />
              <Badge tone={detailAlert.risk_basis === 'confirmed_movement' ? 'danger' : 'neutral'}>
                {detailAlert.risk_basis === 'confirmed_movement' ? 'movement-supported' : 'proximity-based'}
              </Badge>
              <span className="ml-auto font-mono text-[11px] font-semibold text-[#435046]">score {detailAlert.score}/100</span>
            </div>

            {detailRecord?.detection?.annotated_url && (
              <div className="grid gap-3 sm:grid-cols-2">
                <img
                  src={mediaUrl(detailRecord.detection.annotated_url)}
                  alt="Alert evidence"
                  className="h-40 w-full rounded-xl border border-[#ded8c8] object-cover"
                />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Camera', detailRecord.detection.camera_code],
                    ['Confidence', confidencePercent(detailRecord.detection.confidence)],
                    ['Detected', formatDateTime(detailRecord.detection.detected_at)],
                    ['Distance', detailRecord.detection.distance_km != null ? `${detailRecord.detection.distance_km} km` : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-[#f4f0e6] px-2.5 py-2">
                      <div className="text-[8px] uppercase tracking-[0.12em] text-[#9a998e]">{label}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold text-[#435046]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!detailRecord?.detection?.annotated_url && (
              <img src={speciesImage(detailAlert.species)} alt="" className="h-36 w-full rounded-xl object-cover opacity-80" />
            )}

            <div className="rounded-xl border border-[#e8e3d6] bg-[#f8f5ec] p-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a998e]">Reason</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[#5f695f]">{detailAlert.reason}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detailAlert.village_names?.map((name) => (
                  <Badge key={name} tone="neutral">
                    {name}
                  </Badge>
                ))}
                <span className="text-[9.5px] text-[#92988f]">radius {detailAlert.radius_km} km</span>
              </div>
            </div>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a998e]">Assign guard</div>
              <div className="mt-1.5 flex gap-2">
                <select className="field !py-2" value={assignId} onChange={(event) => setAssignId(event.target.value)}>
                  <option value="">Select a guard…</option>
                  {guards.data?.items?.map((guard) => (
                    <option key={guard.id} value={guard.id}>
                      {guard.name} · {guard.badge_id} · {guard.status}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-outline shrink-0 !py-2" onClick={assign} disabled={busy || !assignId}>
                  Assign
                </button>
              </div>
              {detailAlert.assigned_guard && (
                <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[#5f695f]">
                  <Users className="h-3.5 w-3.5 text-forest-500" /> Assigned to{' '}
                  <span className="font-semibold text-ink">{detailAlert.assigned_guard.name}</span> (
                  {detailAlert.assigned_guard.badge_id}) · {detailAlert.assigned_guard.phone}
                </div>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="alert-note">
                Action note (optional)
              </label>
              <textarea
                id="alert-note"
                className="field min-h-[70px] resize-y"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Patrol dispatched along the southern boundary track."
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" className="btn-outline !px-2.5 !py-1.5 !text-[10px]" onClick={() => act('acknowledge')} disabled={busy}>
                  <BellRing className="h-3 w-3" /> Acknowledge
                </button>
                <button type="button" className="btn-outline !px-2.5 !py-1.5 !text-[10px]" onClick={() => act('respond')} disabled={busy}>
                  <Siren className="h-3 w-3" /> Responding
                </button>
              </div>
            </div>

            {actionError && (
              <div className="rounded-lg border border-[#e6b9ac] bg-[#fbf0ec] px-3 py-2 text-[10.5px] text-[#8b3524]">{actionError}</div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a998e]">
                <Clock3 className="h-3 w-3" /> Audit trail
              </div>
              {detail.loading && !detailRecord ? (
                <div className="mt-2 shimmer h-24 rounded-lg" />
              ) : (
                <div className="mt-2 space-y-0">
                  {(detailRecord?.events || []).map((event, index, list) => (
                    <div key={event.id} className="relative flex gap-3 pb-3">
                      {index < list.length - 1 && <span className="absolute left-[6px] top-4 h-full w-px bg-[#e0dacb]" />}
                      <span
                        className="relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-parchment"
                        style={{
                          background:
                            event.kind === 'resolved'
                              ? '#2F7250'
                              : event.kind === 'acknowledged'
                                ? '#D9A441'
                                : event.kind === 'responding'
                                  ? '#B85C38'
                                  : '#7FA36B',
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10.5px] font-semibold text-ink">{titleCase(event.kind)}</span>
                          <span className="text-[9px] text-[#92988f]">{formatDateTime(event.created_at)}</span>
                          <span className="text-[9px] text-[#92988f]">· {event.actor}</span>
                        </div>
                        <div className="mt-0.5 text-[10.5px] leading-relaxed text-[#6f786e]">{event.note}</div>
                      </div>
                    </div>
                  ))}
                  {!detailRecord?.events?.length && (
                    <div className="text-[10.5px] text-[#8b9188]">No events yet.</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-[#f2eee2] px-3 py-2 text-[9px] leading-relaxed text-[#7d867c]">
              Public advisories derived from this alert never include exact detection coordinates, camera positions or
              guard locations.
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
