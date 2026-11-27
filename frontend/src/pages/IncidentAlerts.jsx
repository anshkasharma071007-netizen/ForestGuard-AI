import { useRef, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { assessmentLabel, Dialog, Photo, PhotoPreview, usePhoto } from '../components/ReportReview'
import RefreshButton from '../components/RefreshButton'
import { ErrorBox, Loading, RiskBadge, StatusBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { formatDateTime, titleCase } from '../utils/format'

const riskLevels = ['low', 'moderate', 'high']
const reference = id => `INC-${String(id).padStart(3, '0')}`

function incidentLocation(incident) {
  if (incident.village_name) return incident.village_name
  if (Number.isFinite(incident.lat) && Number.isFinite(incident.lon)) return `${incident.lat.toFixed(5)}, ${incident.lon.toFixed(5)}`
  return 'Location unavailable'
}

function animal(incident) {
  return incident.species === 'unidentified' ? 'Unknown animal' : incident.species_name
}

function DetailField({ label, children, wide }) {
  if (children == null || children === '') return null
  return <div className={`operations-field ${wide ? 'sm:col-span-2' : ''}`}><dt>{label}</dt><dd>{children}</dd></div>
}

function IncidentDetail({ id, close, reload }) {
  const detail = useApi(`/api/incidents/${id}`, { interval: 6000 })
  const [note, setNote] = useState('')
  const [citizenNote, setCitizenNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resolved, setResolved] = useState(null)
  const [viewPhoto, setViewPhoto] = useState(false)
  const operation = useRef(false)
  const { report, alert } = detail.data || {}
  const incident = resolved ?? detail.data?.incident
  const photo = usePhoto(report?.image_url)
  const review = report?.review_history?.findLast(event => event.status === 'verified')
  const risk = incident?.risk
  const title = report?.title || 'Incident details'
  const active = incident?.status === 'verified'
  const events = [
    { title: 'Report approved', at: review?.at, actor: review?.reviewer_name },
    { title: 'Alert published', at: alert?.created_at },
    { title: 'Incident resolved', at: incident?.resolved_at, actor: incident?.resolved_by },
  ].filter(({ at }) => at)

  async function resolve() {
    if (operation.current || !active) return
    operation.current = true
    setBusy(true)
    setError('')
    try {
      const { data } = await api.patch(`/api/incidents/${id}`, { status: 'resolved', note, citizen_note: citizenNote })
      setResolved(data.incident)
      setConfirm(false)
      void detail.reload()
      void reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      operation.current = false
      setBusy(false)
    }
  }

  return <Dialog className="report-review operations-incident-dialog" labelledBy="incident-title" onClose={() => { if (!busy) close() }}>
    <header className="report-review-header">
      <div className="mb-2 flex items-center justify-between">
        <span className="report-review-reference">{reference(id)}</span>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={detail.reload} loading={detail.loading} label="Refresh incident details" />
          <button type="button" aria-label="Close" title="Close" className="operations-control" onClick={close} disabled={busy}><X size={18} /></button>
        </div>
      </div>
      <div className="report-review-title">
        <h1 id="incident-title">{title}</h1>
        {incident && <div className="flex flex-wrap gap-2">
          <RiskBadge level={incident.severity} />
          <StatusBadge status={incident.status === 'resolved' ? 'resolved' : 'under_work'} />
        </div>}
      </div>
    </header>
    {detail.loading && !incident && <Loading label="Loading incident…" height="h-24" />}
    {detail.error && <ErrorBox message={detail.error} onRetry={detail.reload} />}
    {incident && <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="report-review-panel" aria-labelledby="incident-information">
          <h2 id="incident-information" className="font-semibold">Incident information</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailField label="Confirmed animal">{animal(incident)}</DetailField>
            <DetailField label="Category">{titleCase(incident.category)}</DetailField>
            <DetailField label="Location">{incidentLocation(incident)}</DetailField>
            <DetailField label="Location source">{report?.lat != null && report.lon != null ? 'GPS'
              : incident.village_name ? 'Village center' : null}</DetailField>
            <DetailField label="Published">{alert?.created_at && formatDateTime(alert.created_at)}</DetailField>
            <DetailField label="Linked report">{report && <Link className="operations-link break-all" to={`/reports?report=${report.id}`}>{report.reference_code}</Link>}</DetailField>
          </dl>
          {report?.image_url && <div className="report-review-section">
            <h3 className="mb-2 font-medium">Private evidence</h3>
            <PhotoPreview kind="original" photo={photo} onOpen={() => setViewPhoto(true)} />
          </div>}
        </section>
        <section className="report-review-panel" aria-labelledby="incident-management">
          <h2 id="incident-management" className="font-semibold">{active ? 'Incident management' : 'Incident record'}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailField label="Assessment method">{assessmentLabel(risk) || (risk ? 'Recorded assessment' : null)}</DetailField>
            <DetailField label="Automatic assessment">{risk?.original_assessment && titleCase(risk.original_assessment.level)}</DetailField>
            <DetailField label={risk?.assessment_method === 'override' ? 'Override reason' : 'Assessment reason'} wide>{risk?.assessment_reason}</DetailField>
            <DetailField label="Reviewed by">{review?.reviewer_name}</DetailField>
            <DetailField label="Reviewed">{review?.at && formatDateTime(review.at)}</DetailField>
            <DetailField label="Review notes" wide>{review?.note}</DetailField>
            <DetailField label="Resolved by">{incident.resolved_by}</DetailField>
            <DetailField label="Resolved">{incident.resolved_at && formatDateTime(incident.resolved_at)}</DetailField>
            <DetailField label="Resolution notes" wide>{incident.resolution_note}</DetailField>
            <DetailField label="Resolution shared with citizen" wide>{incident.citizen_resolution_note}</DetailField>
          </dl>
          {active && <fieldset disabled={busy} className="report-review-section report-review-form">
            <label htmlFor="incident-resolution-notes">Resolution notes</label>
            <textarea id="incident-resolution-notes" rows={2} maxLength={1000} value={note}
              placeholder="Optional, authority only" onChange={event => setNote(event.target.value)} />
            {report?.is_citizen_submission && <>
              <label htmlFor="incident-shared-notes">Resolution for citizen (optional)</label>
              <textarea id="incident-shared-notes" rows={2} maxLength={1000} value={citizenNote}
                onChange={event => setCitizenNote(event.target.value)} />
            </>}
            {confirm && <p>Resolve this incident and close its public alert?</p>}
            <div className="report-review-actions">
              {confirm ? <>
                <button type="button" className="report-review-action is-approve" onClick={resolve}>{busy ? 'Resolving…' : 'Confirm resolution'}</button>
                <button type="button" className="report-review-action" onClick={() => setConfirm(false)}>Cancel</button>
              </> : <button type="button" className="report-review-action is-approve" onClick={() => setConfirm(true)}>Resolve incident</button>}
            </div>
          </fieldset>}
          {resolved && <p role="status" className="mt-3 text-sm text-success-7">Incident resolved.</p>}
          {error && <div className="mt-3"><ErrorBox message={error} /></div>}
        </section>
      </div>
      {events.length > 0 && <section className="report-review-panel" aria-labelledby="incident-activity">
        <h2 id="incident-activity" className="font-semibold">Activity</h2>
        <ol className="mt-2 divide-y divide-line-6">
          {events.map(event => <li key={event.title} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span>{event.title}{event.actor && <span className="text-muted-3"> · {event.actor}</span>}</span>
            <time className="text-xs text-muted-3" dateTime={event.at}>{formatDateTime(event.at)}</time>
          </li>)}
        </ol>
      </section>}
    </div>}
    {viewPhoto && photo.url && <Dialog className="report-review-lightbox" labelledBy="incident-photo-title" onClose={() => setViewPhoto(false)}>
      <header className="report-review-nav">
        <h2 id="incident-photo-title">Private evidence</h2>
        <button type="button" onClick={() => setViewPhoto(false)} aria-label="Close photo"><X aria-hidden="true" /></button>
      </header>
      <div className="report-review-photo"><Photo photo={photo} alt="Enlarged original evidence" /></div>
    </Dialog>}
  </Dialog>
}

export default function IncidentAlerts() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') === 'resolved' ? 'resolved' : 'active'
  const riskParam = params.get('risk')
  const risk = riskLevels.includes(riskParam) ? riskParam : ''
  const selected = params.get('incident')
  const { data, loading, error, reload } = useApi(
    `/api/operations/alerts?status=${status}${risk ? '&risk=' + risk : ''}`, { interval: 6000 },
  )

  function filter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return <>
    <header className="operations-heading">
      <h1>Alerts</h1>
      <RefreshButton onClick={reload} loading={loading} label="Refresh incidents" />
    </header>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Incident status">
        {Object.entries({ active: 'Active incidents', resolved: 'Resolved history' }).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={status === value} onClick={() => filter('status', value)}
            className={`rounded-lg px-3 py-2 ${status === value ? 'btn-lime' : 'btn-outline'}`}>{label}</button>)}
      </div>
      <label className="text-sm">Risk level
        <select className="field ml-2 inline-block !w-auto !py-2" value={risk} onChange={event => filter('risk', event.target.value)}>
          <option value="">All risk levels</option>
          {riskLevels.map(value => <option value={value} key={value}>{titleCase(value)}</option>)}
        </select>
      </label>
      <Link className="operations-link self-center lg:ml-auto" to="/risk">Detection alerts</Link>
    </div>
    {error && <ErrorBox message={error} onRetry={reload} />}
    {!data && loading && <Loading label="Loading incidents…" height="h-24" />}
    {data && !data.items.length && <p className="operations-panel p-4 text-sm text-muted-3">
      {risk ? 'No matching incidents' : `No ${status} incidents`}
    </p>}
    <ul className="grid gap-3">
      {data?.items.map(incident => <li key={incident.id}>
        <button type="button" className="operations-incident-row" data-risk={incident.severity} onClick={() => filter('incident', incident.id)}>
          <span className="operations-item-title">
            <span className="block text-xs text-muted-3">{reference(incident.id)}</span>
            <strong className="block text-base text-ink">{incident.title || animal(incident)}</strong>
            <span className="block text-sm text-secondary-9">{animal(incident)} · {incidentLocation(incident)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {incident.published_at && <time dateTime={incident.published_at} className="text-xs text-muted-3">{formatDateTime(incident.published_at)}</time>}
            <RiskBadge level={incident.severity} />
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        </button>
      </li>)}
    </ul>
    {selected && <IncidentDetail key={selected} id={selected} close={() => filter('incident', null)} reload={reload} />}
  </>
}
