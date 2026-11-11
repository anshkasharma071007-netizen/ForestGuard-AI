import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Crosshair,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Siren,
  TriangleAlert,
  UserCheck,
  Users,
} from 'lucide-react'
import api, { errorMessage, mediaUrl } from '../api/client'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import MapView from '../components/MapView'
import { AlertRow, DetectionTable } from '../components/cards'
import {
  Badge,
  DemoNotice,
  EmptyState,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  RiskBadge,
  SectionTitle,
  StatCard,
  StatusBadge,
} from '../components/ui'
import { formatDateTime, timeAgo, titleCase } from '../utils/format'

function hoursBetween(start, end) {
  if (!start || !end) return null
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3600000
  return diff >= 0 ? diff : null
}

export default function GuardPanel() {
  const { isAdmin, user } = useAuth()
  const [viewGuard, setViewGuard] = useState('')
  const path = viewGuard ? `/api/guard/dashboard?guard_id=${viewGuard}` : '/api/guard/dashboard'
  const dashboard = useApi(path)
  const guards = useApi('/api/guards')
  const map = useApi('/api/map/layers?days=21')
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [assignId, setAssignId] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const detail = useApi(selected ? `/api/alerts/${selected.id}` : null, {
    enabled: Boolean(selected),
  })
  const record =
    detail.data?.alert && detail.data.alert.id === selected?.id ? detail.data.alert : null
  const current = record || selected

  const data = dashboard.data
  const isDispatch = data?.view === 'dispatch'
  const openStatuses = ['active', 'acknowledged', 'responding']
  const tasks = isDispatch
    ? data?.zone_alerts || []
    : (data?.assigned_alerts || []).filter((alert) => openStatuses.includes(alert.status))
  const summary = data?.summary || {}
  const guard = data?.guard

  const focus = useMemo(() => {
    if (guard?.lat == null || guard?.lon == null) return null
    return [guard.lat, guard.lon, 12]
  }, [guard])

  const openTask = (alert) => {
    setSelected(alert)
    setNote('')
    setActionError(null)
    setAssignId(alert.assigned_guard?.id ? String(alert.assigned_guard.id) : '')
  }

  const act = async (action) => {
    if (!selected) return
    setBusy(true)
    setActionError(null)
    try {
      await api.post(`/api/alerts/${selected.id}/${action}`, { note: note || undefined })
      await detail.reload()
      await dashboard.reload()
      setNote('')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const assign = async () => {
    if (!assignId) {
      setActionError('Choose a guard to assign this task.')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await api.post(`/api/alerts/${selected.id}/assign`, {
        guard_id: Number(assignId),
        note: note || undefined,
      })
      await detail.reload()
      await dashboard.reload()
      setNote('')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Field operations · ${guard?.zone || (isDispatch ? 'Range dispatch' : 'Guard board')}`}
        title={isDispatch ? 'Dispatch field response' : 'Your task board'}
        description={
          isDispatch
            ? 'Review every open alert across the demonstration landscape and dispatch the nearest available guard. All actions are audited on the alert record.'
            : 'Acknowledge alerts, record your response and close verified tasks. Tasks are generated from proximity-based risk alerts in your assigned zone.'
        }
        actions={
          <>
            {guard?.status && <Badge tone={guard.status === 'available' ? 'forest' : guard.status === 'on_patrol' ? 'warning' : 'neutral'} dot>{titleCase(guard.status)}</Badge>}
            <button type="button" className="btn-outline" onClick={dashboard.reload}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh board
            </button>
          </>
        }
      />

      <DemoNotice compact>
        <strong className="font-semibold">Demonstration task board.</strong> Alerts are synthesised from near-boundary
        detections. Acknowledging or resolving a task updates the demo audit trail only — no real dispatch is sent.
      </DemoNotice>

      {isAdmin && (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a998e]">Dispatch view</div>
            <div className="mt-0.5 text-[12px] text-[#5f695f]">
              Inspect any guard&apos;s board or the landscape-wide dispatch queue.
            </div>
          </div>
          <select
            className="field max-w-xs !py-2"
            value={viewGuard}
            onChange={(event) => setViewGuard(event.target.value)}
          >
            <option value="">Landscape dispatch (all open alerts)</option>
            {guards.data?.items?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.badge_id} · {titleCase(item.status)}
              </option>
            ))}
          </select>
        </div>
      )}

      {dashboard.error && <ErrorBox message={dashboard.error} onRetry={dashboard.reload} />}
      {dashboard.loading && !data ? (
        <Loading label="Loading field assignments…" height="h-72" />
      ) : (
        data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Open tasks"
                value={summary.open_tasks ?? 0}
                hint={isDispatch ? 'Alerts awaiting acknowledgement or closure' : 'Assigned to you and still open'}
                icon={ClipboardList}
                tone="clay"
              />
              <StatCard
                label="High priority"
                value={summary.high_priority ?? 0}
                hint="Open tasks above the high risk threshold"
                icon={Siren}
                tone="amber"
              />
              <StatCard
                label={isDispatch ? 'Guards on patrol' : 'Acknowledged'}
                value={isDispatch ? summary.guards_on_patrol ?? 0 : summary.acknowledged ?? 0}
                hint={isDispatch ? 'Currently marked on patrol in the roster' : 'Tasks with a recorded acknowledgement'}
                icon={isDispatch ? Users : UserCheck}
                tone="forest"
              />
              <StatCard
                label={isDispatch ? 'Open incidents' : 'Resolved · 7 days'}
                value={isDispatch ? data.open_incidents?.length ?? 0 : summary.resolved_7d ?? 0}
                hint={
                  isDispatch
                    ? 'Field incidents pending verification or closure'
                    : summary.avg_resolution_hours
                      ? `Mean closure time ${summary.avg_resolution_hours} h`
                      : 'No resolved tasks in the last seven days'
                }
                icon={isDispatch ? TriangleAlert : CheckCircle2}
                tone="slate"
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle
                  title={isDispatch ? 'Dispatch queue' : 'Assigned tasks'}
                  subtitle={data.task_note}
                  action={
                    <Badge tone={tasks.length ? 'danger' : 'forest'}>
                      {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                    </Badge>
                  }
                />
                <div className="mt-3 space-y-2">
                  {tasks.length ? (
                    tasks.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        onClick={() => openTask(alert)}
                        actions={
                          <>
                            {alert.status === 'active' && (
                              <button
                                type="button"
                                className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                                onClick={() => openTask(alert)}
                              >
                                <BellRing className="h-3 w-3" /> Acknowledge
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                              onClick={() => openTask(alert)}
                            >
                              Open task <ChevronRight className="h-3 w-3" />
                            </button>
                          </>
                        }
                      />
                    ))
                  ) : (
                    <EmptyState
                      icon={ShieldCheck}
                      title="No open tasks"
                      description={
                        isDispatch
                          ? 'Every alert in the demonstration dataset has been resolved.'
                          : 'There are no open alerts assigned to you. New proximity alerts appear here automatically.'
                      }
                      action={
                        <Link to="/risk" className="btn-outline !py-2">
                          Review alert history
                        </Link>
                      }
                    />
                  )}
                </div>
              </div>

              <div className="space-y-4 xl:col-span-5">
                <div className="card-dark relative overflow-hidden p-5">
                  <img src="/images/forest.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/85 to-forest-950/50" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-lime/80">
                      <ShieldCheck className="h-3.5 w-3.5" /> Officer profile
                    </div>
                    {guard ? (
                      <>
                        <div className="mt-2 font-display text-[22px] leading-tight text-parchment">{guard.name}</div>
                        <div className="mt-1 text-[10.5px] text-forest-100/60">
                          {guard.badge_id} · {guard.zone}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[8px] uppercase tracking-[0.14em] text-forest-200/50">Status</div>
                            <div className="mt-0.5 text-[11.5px] font-semibold text-parchment">{titleCase(guard.status)}</div>
                          </div>
                          <div>
                            <div className="text-[8px] uppercase tracking-[0.14em] text-forest-200/50">Contact</div>
                            <div className="mt-0.5 text-[11.5px] font-semibold text-parchment">{guard.phone}</div>
                          </div>
                          <div>
                            <div className="text-[8px] uppercase tracking-[0.14em] text-forest-200/50">Role</div>
                            <div className="mt-0.5 text-[11.5px] font-semibold text-parchment">
                              {guard.role === 'admin' ? 'Range officer' : 'Forest guard'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] uppercase tracking-[0.14em] text-forest-200/50">Email</div>
                            <div className="mt-0.5 truncate text-[11.5px] font-semibold text-parchment">{guard.email || user?.email}</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 font-display text-[22px] leading-tight text-parchment">
                          Range dispatch overview
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-forest-100/60">
                          No guard profile is linked to this admin account. Use the dispatch queue on the left to
                          review every open alert, and the roster below to inspect a guard&apos;s board.
                        </p>
                      </>
                    )}
                    <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[9px] uppercase tracking-[0.14em] text-forest-200/45">
                      <Phone className="h-3 w-3" /> Synthetic contact record
                    </div>
                  </div>
                </div>

                <div className="card p-5">
                  <SectionTitle
                    title="Zone brief"
                    subtitle={guard ? 'Recent signals within 12 km of your position' : 'Latest signals across the landscape'}
                  />
                  <div className="mt-3 space-y-2">
                    {(data.recent_detections || []).slice(0, 4).map((detection) => (
                      <div key={detection.id} className="flex items-center gap-2.5 rounded-lg border border-[#ece7da] bg-white/60 px-2.5 py-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: detection.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold text-ink">{detection.species_name}</div>
                          <div className="text-[9px] text-[#8b9188]">
                            {detection.camera_code || 'Upload'} · {timeAgo(detection.detected_at)}
                          </div>
                        </div>
                        <RiskBadge level={detection.risk_level} score={detection.risk_score} />
                      </div>
                    ))}
                    {!data.recent_detections?.length && (
                      <div className="text-[11px] text-[#8b9188]">No recent signals recorded for this zone.</div>
                    )}
                  </div>
                  {(data.zone_alerts || []).length > 0 && !isDispatch && (
                    <div className="mt-3 rounded-lg bg-[#f4f0e6] px-2.5 py-2 text-[9.5px] leading-relaxed text-[#7d867c]">
                      {(data.zone_alerts || []).length} open alerts are active within 12 km of your position; the queue is
                      prioritised by score. Unassigned high-priority alerts appear in dispatch.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-[#e8e3d6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="eyebrow">Operational geography</div>
                  <h2 className="mt-1 font-display text-[19px] text-ink">High-risk areas and alert coverage</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">{data.open_incidents?.length || 0} incidents</Badge>
                  <Badge tone="neutral">21-day window</Badge>
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
                    tracks: false,
                    cameras: false,
                    incidents: true,
                    guards: false,
                  }}
                  height="380px"
                  focus={focus}
                  onSelectDetection={() => {}}
                  className="rounded-none border-0"
                />
              ) : (
                <div className="flex h-[380px] items-center justify-center text-[12px] text-[#8a9187]">
                  Loading zone geography…
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e8e3d6] px-4 py-2.5 text-[9.5px] text-[#92988f]">
                <span className="flex items-center gap-1.5">
                  <Crosshair className="h-3 w-3" /> Dashed rings show the configurable village alert radius.
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Illustrative geography; no live surveillance layer.
                </span>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-6">
                <SectionTitle
                  title="Recent detections"
                  subtitle={guard?.zone ? `Latest camera records in ${guard.zone}` : 'Latest landscape records'}
                  action={
                    <Link to="/wildlife" className="text-[11px] font-semibold text-forest-600 hover:underline">
                      Wildlife history
                    </Link>
                  }
                />
                <div className="mt-3">
                  <DetectionTable items={(data.recent_detections || []).slice(0, 6)} compact />
                </div>
              </div>

              <div className="card p-5 xl:col-span-6">
                <SectionTitle
                  title="Field incidents"
                  subtitle="Open and verified reports requiring attention"
                  action={<Badge tone="warning">{data.open_incidents?.length || 0}</Badge>}
                />
                <div className="mt-3 space-y-2">
                  {(data.open_incidents || []).slice(0, 5).map((incident) => (
                    <div key={incident.id} className="rounded-xl border border-[#e9e4d7] bg-white/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <TriangleAlert className="h-3.5 w-3.5 text-clay" />
                          <span className="text-[11.5px] font-semibold text-ink">{titleCase(incident.category)}</span>
                          <StatusBadge status={incident.status} />
                        </div>
                        <RiskBadge
                          level={
                            incident.severity === 'high'
                              ? 'high'
                              : incident.severity === 'moderate'
                                ? 'moderate'
                                : 'low'
                          }
                        />
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-[#7d867c]">
                        {incident.description}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-[#92988f]">
                        <span>{incident.village_name || 'Buffer area'}</span>
                        <span>·</span>
                        <span>{timeAgo(incident.created_at)}</span>
                        <span>·</span>
                        <span>reported by {incident.reported_by}</span>
                      </div>
                    </div>
                  ))}
                  {!data.open_incidents?.length && (
                    <div className="rounded-xl border border-dashed border-[#ddd7c8] px-4 py-8 text-center text-[12px] text-[#8a9187]">
                      No open incidents.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle
                  title="Response history"
                  subtitle="Resolved tasks in the last seven days, with audit trail"
                />
                <div className="mt-3 space-y-2">
                  {(data.response_history || []).map((alert) => {
                    const hours = hoursBetween(alert.created_at, alert.resolved_at)
                    return (
                      <div key={alert.id} className="rounded-xl border border-[#e9e4d7] bg-white/60 p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11.5px] font-semibold text-ink">{alert.species_name}</span>
                          <Badge tone="forest">
                            <CheckCircle2 className="h-2.5 w-2.5" /> resolved
                          </Badge>
                          <span className="ml-auto font-mono text-[9px] text-[#92988f]">
                            {hours != null ? `${hours.toFixed(1)} h to close` : 'closure time unavailable'}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] leading-relaxed text-[#7d867c]">{alert.reason}</div>
                        <div className="mt-2 space-y-1">
                          {(alert.events || []).slice(-2).map((event) => (
                            <div key={event.id} className="flex items-start gap-1.5 text-[9px] text-[#8b9188]">
                              <Clock3 className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                              <span>
                                <span className="font-semibold text-[#5f695f]">{titleCase(event.kind)}</span> ·{' '}
                                {event.note} · {event.actor}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {!data.response_history?.length && (
                    <div className="rounded-xl border border-dashed border-[#ddd7c8] px-4 py-10 text-center text-[12px] text-[#8a9187]">
                      No resolved tasks in the last seven days. Close a task to build the response record.
                    </div>
                  )}
                </div>
              </div>

              <div className="card p-5 xl:col-span-5">
                <SectionTitle
                  title="Access & responsibilities"
                  subtitle="Role-based controls applied to this board"
                  action={<ShieldCheck className="h-4 w-4 text-[#9a998e]" />}
                />
                <div className="mt-3 space-y-2">
                  {[
                    ['Guard', 'Acknowledge, respond to and resolve tasks assigned in their zone.'],
                    ['Range officer (admin)', 'Reassign tasks, edit the risk configuration and review every zone.'],
                    ['Community', 'Receives coarse public advisories only — never coordinates or patrol positions.'],
                  ].map(([role, detail]) => (
                    <div key={role} className="rounded-lg border border-[#ece7da] bg-[#f8f5ec] px-3 py-2">
                      <div className="text-[10.5px] font-semibold text-ink">{role}</div>
                      <div className="mt-0.5 text-[9.5px] leading-relaxed text-[#7d867c]">{detail}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-forest-900 px-3 py-2 text-[9px] leading-relaxed text-forest-100/65">
                  Tasks are derived from risk-engine alerts. The engine deduplicates alerts within 24 hours and
                  never claims verified animal movement unless a camera sequence supports it.
                </div>
                <Link to="/risk" className="btn-outline mt-3 w-full !py-2">
                  Open alert management <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </section>
          </>
        )
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={current ? `${current.species_name} · task #${current.id}` : 'Task'}
        subtitle={
          current
            ? `${titleCase(current.severity)} priority · created ${formatDateTime(current.created_at)}`
            : ''
        }
        width="max-w-3xl"
        footer={
          current && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={current.status} />
                <RiskBadge level={current.severity} score={current.score} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {current.status !== 'resolved' && (
                  <button type="button" className="btn-outline !py-2" onClick={() => act('respond')} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Siren className="h-3.5 w-3.5" />}
                    Mark responding
                  </button>
                )}
                {current.status !== 'resolved' && (
                  <button type="button" className="btn-primary !py-2" onClick={() => act('resolve')} disabled={busy}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolve task
                  </button>
                )}
              </div>
            </div>
          )
        }
      >
        {current && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={current.risk_basis === 'confirmed_movement' ? 'danger' : 'neutral'}>
                {current.risk_basis === 'confirmed_movement' ? 'movement-supported' : 'proximity-based'}
              </Badge>
              {current.village_names?.map((name) => (
                <Badge key={name} tone="neutral">
                  {name}
                </Badge>
              ))}
              <span className="ml-auto font-mono text-[11px] font-semibold text-[#435046]">
                score {current.score}/100
              </span>
            </div>

            {record?.detection?.annotated_url ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <img
                  src={mediaUrl(record.detection.annotated_url)}
                  alt="Alert evidence"
                  className="h-40 w-full rounded-xl border border-[#ded8c8] object-cover"
                />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Camera', record.detection.camera_code || 'Upload'],
                    ['Confidence', `${Math.round((record.detection.confidence || 0) * 100)}%`],
                    ['Detected', formatDateTime(record.detection.detected_at)],
                    [
                      'Distance',
                      record.detection.distance_km != null ? `${record.detection.distance_km} km` : '—',
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-[#f4f0e6] px-2.5 py-2">
                      <div className="text-[8px] uppercase tracking-[0.12em] text-[#9a998e]">{label}</div>
                      <div className="mt-0.5 text-[10.5px] font-semibold text-[#435046]">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-[#f4f0e6] px-3 py-2 text-[10px] text-[#7d867c]">
                Evidence image metadata is available from the alert record. Demonstration alerts use placeholder
                imagery and do not represent real camera captures.
              </div>
            )}

            <div className="rounded-xl border border-[#e8e3d6] bg-[#f8f5ec] p-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a998e]">Why this task</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[#5f695f]">{current.reason}</div>
              <div className="mt-2 text-[9px] text-[#92988f]">
                Villages within {current.radius_km} km ·{' '}
                {current.assigned_guard ? `assigned to ${current.assigned_guard.name}` : 'not yet assigned'}
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="guard-note">
                Field note (recorded in the audit trail)
              </label>
              <textarea
                id="guard-note"
                className="field min-h-[64px] resize-y"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Patrol checked the southern boundary; no fresh pugmarks observed."
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                  onClick={() => act('acknowledge')}
                  disabled={busy || current.status === 'resolved'}
                >
                  <BellRing className="h-3 w-3" /> Acknowledge
                </button>
                <button
                  type="button"
                  className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                  onClick={() => act('respond')}
                  disabled={busy || current.status === 'resolved'}
                >
                  <Siren className="h-3 w-3" /> Responding
                </button>
              </div>
            </div>

            {isAdmin && (
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a998e]">Assign or reassign</div>
                <div className="mt-1.5 flex gap-2">
                  <select className="field !py-2" value={assignId} onChange={(event) => setAssignId(event.target.value)}>
                    <option value="">Select a guard…</option>
                    {guards.data?.items?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.badge_id} · {item.status}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-outline shrink-0 !py-2" onClick={assign} disabled={busy || !assignId}>
                    Assign
                  </button>
                </div>
              </div>
            )}

            {actionError && (
              <div className="rounded-lg border border-[#e6b9ac] bg-[#fbf0ec] px-3 py-2 text-[10.5px] text-[#8b3524]">
                {actionError}
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9a998e]">
                <Clock3 className="h-3 w-3" /> Audit trail
              </div>
              {detail.loading && !record ? (
                <div className="mt-2 shimmer h-20 rounded-lg" />
              ) : (
                <div className="mt-2">
                  {(record?.events || []).map((event, index, list) => (
                    <div key={event.id} className="relative flex gap-3 pb-2.5">
                      {index < list.length - 1 && <span className="absolute left-[6px] top-4 h-full w-px bg-[#e0dacb]" />}
                      <span className="relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-parchment bg-forest-500" />
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
                  {!record?.events?.length && (
                    <div className="text-[10.5px] text-[#8b9188]">No audit events recorded for this task yet.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
