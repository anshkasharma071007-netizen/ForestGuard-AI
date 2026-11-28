import { useLanguage } from '../i18n'
import EvidenceImage from '../components/EvidenceImage'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crosshair,
  Loader2,
  ShieldAlert,
  Siren,
  Users,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import MapView from '../components/MapView'
import { AlertRow } from '../components/cards'
import {
  Badge,
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

export default function RiskAlerts() {
  const { t, dateTime, term, alertReason } = useLanguage()
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useApi('/api/alerts?days=45&limit=200', { interval: 6000 })
  const zones = useApi('/api/risk/zones?days=21')
  const guards = useApi('/api/guards')
  const map = useApi('/api/map/layers?days=45')
  const [statusFilter, setStatusFilter] = useState('open')
  const [severity, setSeverity] = useState('')
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [note, setNote] = useState('')
  const [assignId, setAssignId] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const linkedId = Number(params.get('alert'))
  const selectedId = selectedAlert?.id ?? (Number.isSafeInteger(linkedId) && linkedId > 0 ? linkedId : null)
  const detail = useApi(selectedId ? `/api/alerts/${selectedId}` : null, {
    enabled: Boolean(selectedId),
    interval: 6000,
  })

  const items = data?.items?.filter((alert) => alert.detection_id) || []
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
  const detailRecord = detail.data?.alert?.id === selectedId ? detail.data.alert : null
  const detailAlert = detailRecord || selectedAlert

  const openDetail = (alert) => {
    setSelectedAlert(alert)
    setNote('')
    setActionError(null)
    setAssignId(alert.assigned_guard?.id ? String(alert.assigned_guard.id) : '')
  }

  const act = async (action, payload = {}) => {
    if (!selectedId || busy) return
    setBusy(true)
    setActionError(null)
    try {
      await api.post(`/api/alerts/${selectedId}/${action}`, { note: note || undefined, ...payload })
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Automated detection alerts')}
        description={t('Inspect detection alerts and coordinate guard response.')}
        actions={
          <>
            <Badge tone="danger" dot>
              {openCount} {t('open')}
            </Badge>
          </>
        }
      />

      <div className="card flex flex-wrap items-center gap-x-1.5 gap-y-2 px-4 py-3">
        <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-16">{t('Workflow')}</span>
        {WORKFLOW.map((step, index) => (
          <div key={step} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-full border border-line-5 bg-raised/70 px-2 py-0.5 text-[9.5px] font-medium text-secondary-8">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-forest-900 font-mono text-[7.5px] text-lime">
                {index + 1}
              </span>
              {t(step)}
            </span>
            {index < WORKFLOW.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-muted-19" />}
          </div>
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Open alerts')} value={openCount} hint={t('Active, acknowledged and responding')} icon={Siren} tone="clay" />
        <StatCard label={t('High priority')} value={highCount} hint={t('Open alerts above the high threshold')} icon={ShieldAlert} tone="amber" />
        <StatCard
          label={t('High-risk cells')}
          value={zoneSummary?.high ?? '—'}
          hint={t('{count} indicative grid cells in 21 days', { count: zoneSummary?.cells ?? '—' })}
          icon={Crosshair}
          tone="forest"
        />
        <StatCard
          label={t('Villages exposed')}
          value={exposure.filter((village) => village.level !== 'low').length}
          hint={t('Moderate or high exposure within the alert radius')}
          icon={Users}
          tone="slate"
        />
      </section>

      {error && <ErrorBox message={error} onRetry={reload} />}

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="card overflow-hidden xl:col-span-12">
          <div className="flex flex-col gap-2 border-b border-line-10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="eyebrow">{t('Risk surface')}</div>
              <h2 className="mt-1 font-display text-[19px] text-ink">{t('Indicative zones & alert coverage')}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone="danger">{t('high')} {zoneSummary?.high ?? 0}</Badge>
              <Badge tone="warning">{t('moderate')} {zoneSummary?.moderate ?? 0}</Badge>
              <Badge tone="forest">{t('low')} {zoneSummary?.low ?? 0}</Badge>
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
              onSelectDetection={() => { }}
              className="rounded-none border-0"
            />
          ) : (
            <div className="flex h-[430px] items-center justify-center text-[12px] text-muted-8">
              {t('Loading risk surface…')}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-10 px-4 py-2.5 text-[9.5px] text-muted-13">
            <span>{t('Zones combine recent signal strength with village exposure.')}</span>
            <span>{t('Dashed circles = configurable alert radius')}</span>
          </div>
        </div>

      </section>

      <section className="card p-5">
        <SectionTitle
          title={t('Village exposure')}
          subtitle={t('Maximum recent risk score within the alert radius plus 0.5 km')}
          action={<Badge tone="neutral">{t('14-day window')}</Badge>}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {exposure.map((village) => (
            <div key={village.id} className="rounded-xl border border-line-10 bg-raised/60 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[11.5px] font-semibold text-ink">{village.name}</div>
                <RiskBadge level={village.level} />
              </div>
              <div className="mt-1.5 flex items-end justify-between">
                <div>
                  <div className="font-mono text-[18px] font-semibold text-ink">{village.max_score}</div>
                  <div className="text-[8.5px] uppercase tracking-[0.1em] text-muted-16">{t('max score')}</div>
                </div>
                <div className="text-right text-[9px] text-muted-9">
                  {village.detections_14d} {t('signals')}
                  <br />
                  {village.top_species ? term('species', village.top_species) : t('No dominant animal')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <SectionTitle
          title={t('Alert management')}
          subtitle={t('Acknowledge, assign, mark responding, and close with an audit trail')}
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                ['open', t('Open')],
                ['resolved', t('Resolved')],
                ['all', t('All')],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusFilter === value
                      ? 'border-forest-600 bg-success-surface-5 text-success-8'
                      : 'border-control-line-8 bg-raised text-muted-5'
                    }`}
                >
                  {t(label)}
                </button>
              ))}
              <select
                className="rounded-lg border border-control-line-3 bg-raised px-2 py-1 text-[10px] text-secondary-8"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="">{t('All severities')}</option>
                <option value="high">{t('High')}</option>
                <option value="moderate">{t('Moderate')}</option>
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
              <div className="col-span-full rounded-xl border border-dashed border-control-line-5 px-4 py-12 text-center text-[12px] text-muted-8">
                {t('No alerts match this view. Try “All” or clear the severity filter.')}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="card p-5 xl:col-span-6">
          <SectionTitle title={t('Guard roster')} subtitle={t('Nearest available guard is auto-assigned on creation')} />
          <div className="mt-3 space-y-1.5">
            {guards.data?.items?.map((guard) => (
              <div key={guard.id} className="flex items-center gap-3 rounded-lg border border-line-13 bg-raised/60 px-3 py-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success-surface-5 text-[9.5px] font-bold text-success-8">
                  {guard.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-semibold text-ink">{guard.name}</div>
                  <div className="text-[9.5px] text-muted-9">
                    {guard.badge_id} · {guard.zone} · {guard.phone}
                  </div>
                </div>
                <Badge tone={guard.status === 'available' ? 'forest' : guard.status === 'on_patrol' ? 'warning' : 'neutral'}>
                  {t(titleCase(guard.status))}
                </Badge>
                <span className="font-mono text-[9px] text-muted-13">{guard.open_tasks} {t('open')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5 xl:col-span-6">
          <SectionTitle title={t('Why a score, not a prediction')} subtitle={t('The engine separates evidence types')} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line-10 bg-inset-14 p-3">
              <div className="text-[11px] font-semibold text-ink">{t('Proximity-based')}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-muted-5">
                {t('A detection is near a village boundary. This raises attention but does not imply approach.')}
              </div>
            </div>
            <div className="rounded-xl border border-danger-line-2 bg-danger-surface-4 p-3">
              <div className="text-[11px] font-semibold text-danger-2">{t('Movement-supported')}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-danger-4">
                {t('A verified camera sequence indicates direction toward a village. Still inferred, never GPS.')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedAlert(null)
          if (params.has('alert')) setParams(previous => { const next = new URLSearchParams(previous); next.delete('alert'); return next })
        }}
        title={detailAlert ? t('Alert · {animal}', { animal: term('species', detailAlert.species, detailAlert.species_name) }) : t('Alert')}
        subtitle={detailAlert ? t('Alert #{id} · {risk} priority · {time}', { id: detailAlert.id, risk: term('risk', detailAlert.severity), time: dateTime(detailAlert.created_at) }) : ''}
        width="max-w-3xl"
        footer={
          detailAlert && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[9.5px] text-muted-13">
                {detailAlert.is_simulated ? t('Simulated alert.') : detailAlert.incident_id ? t('Verified community incident.') : t('Field detection alert.')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detailAlert.status !== 'resolved' && detailAlert.status !== 'responding' && (
                  <button type="button" className="btn-outline !py-2" onClick={() => act('respond')} disabled={busy}>
                    {t('Mark responding')}
                  </button>
                )}
                {detailAlert.status !== 'resolved' && (
                  <button type="button" className="btn-primary !py-2" onClick={() => act('resolve')} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {t('Resolve alert')}
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {!detailAlert && detail.loading && <Loading label={t('Loading alert…')} height="h-24" />}
        {!detailAlert && detail.error && <ErrorBox message={detail.error} onRetry={detail.reload} />}
        {detailAlert && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SpeciesTag species={detailAlert.species} name={detailAlert.species_name} color={detailAlert.color} />
              <StatusBadge domain="alert" status={detailAlert.status} />
              <Badge tone={detailAlert.risk_basis === 'confirmed_movement' ? 'danger' : 'neutral'}>
                {detailAlert.risk_basis === 'confirmed_movement' ? t('movement-supported') : t('proximity-based')}
              </Badge>
              <span className="ml-auto font-mono text-[11px] font-semibold text-secondary-3">{t('score')} {detailAlert.score}/100</span>
            </div>

            {detailRecord?.detection?.annotated_url && (
              <div className="grid gap-3 sm:grid-cols-2">
                <EvidenceImage
                  path={detailRecord.detection.annotated_url}
                  alt={t('Alert evidence')}
                  className="h-40 w-full rounded-xl border border-control-line-7 object-cover"
                />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    [t('Camera'), detailRecord.detection.camera_code],
                    [t('Confidence'), confidencePercent(detailRecord.detection.confidence)],
                    ['Detected', dateTime(detailRecord.detection.detected_at)],
                    [t('Distance'), Number.isFinite(detailRecord.detection.distance_km) ? t('{distance} km', { distance: detailRecord.detection.distance_km }) : t('Unavailable')],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-inset-2 px-2.5 py-2">
                      <div className="text-[8px] uppercase tracking-[0.12em] text-muted-16">{t(label)}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold text-secondary-3">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!detailRecord?.detection?.annotated_url && (
              <img src={speciesImage(detailAlert.species)} alt="" className="h-36 w-full rounded-xl object-cover opacity-80" />
            )}

            <div className="rounded-xl border border-line-10 bg-inset-14 p-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-16">{t('Reason')}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-secondary-8">{alertReason(detailAlert.reason)}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detailAlert.village_names?.map((name) => (
                  <Badge key={name} tone="neutral">
                    {name}
                  </Badge>
                ))}
                <span className="text-[9.5px] text-muted-13">{t('radius')} {detailAlert.radius_km} {t('km')}</span>
              </div>
            </div>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-16">{t('Assign guard')}</div>
              <div className="mt-1.5 flex gap-2">
                <select className="field !py-2" value={assignId} onChange={(event) => setAssignId(event.target.value)}>
                  <option value="">{t('Select a guard…')}</option>
                  {guards.data?.items?.map((guard) => (
                    <option key={guard.id} value={guard.id}>
                      {guard.name} · {guard.badge_id} · {t(titleCase(guard.status))}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-outline shrink-0 !py-2" onClick={assign} disabled={busy || !assignId}>
                  {t('Assign')}
                </button>
              </div>
              {detailAlert.assigned_guard && (
                <div className="mt-2 flex items-center gap-2 text-[10.5px] text-secondary-8">
                  <Users className="h-3.5 w-3.5 text-success-5" /> {t('Assigned to')}{' '}
                  <span className="font-semibold text-ink">{detailAlert.assigned_guard.name}</span> (
                  {detailAlert.assigned_guard.badge_id}) · {detailAlert.assigned_guard.phone}
                </div>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="alert-note">
                {t('Action note (optional)')}
              </label>
              <textarea
                id="alert-note"
                className="field min-h-[70px] resize-y"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('e.g. Patrol dispatched along the southern boundary track.')}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" className="btn-outline !px-2.5 !py-1.5 !text-[10px]" onClick={() => act('acknowledge')} disabled={busy}>
                  <BellRing className="h-3 w-3" /> {t('Acknowledge')}
                </button>
                <button type="button" className="btn-outline !px-2.5 !py-1.5 !text-[10px]" onClick={() => act('respond')} disabled={busy}>
                  <Siren className="h-3 w-3" /> {t('Responding')}
                </button>
              </div>
            </div>

            {actionError && (
              <div className="rounded-lg border border-danger-line-1 bg-danger-surface-3 px-3 py-2 text-[10.5px] text-danger-2">{actionError}</div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-16">
                <Clock3 className="h-3 w-3" /> {t('Audit trail')}
              </div>
              {detail.loading && !detailRecord ? (
                <div className="mt-2 shimmer h-24 rounded-lg" />
              ) : (
                <div className="mt-2 space-y-0">
                  {(detailRecord?.events || []).map((event, index, list) => (
                    <div key={event.id} className="relative flex gap-3 pb-3">
                      {index < list.length - 1 && <span className="absolute left-[6px] top-4 h-full w-px bg-line-1" />}
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
                          <span className="text-[10.5px] font-semibold text-ink">{t(titleCase(event.kind))}</span>
                          <span className="text-[9px] text-muted-13">{dateTime(event.created_at)}</span>
                          <span className="text-[9px] text-muted-13">· {event.actor}</span>
                        </div>
                        <div className="mt-0.5 text-[10.5px] leading-relaxed text-secondary-15">{event.note}</div>
                      </div>
                    </div>
                  ))}
                  {!detailRecord?.events?.length && (
                    <div className="text-[10.5px] text-muted-9">{t('No events yet.')}</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-inset-1 px-3 py-2 text-[9px] leading-relaxed text-muted-5">
              {t('Public advisories derived from this alert never include exact detection coordinates, camera positions or guard locations.')}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
