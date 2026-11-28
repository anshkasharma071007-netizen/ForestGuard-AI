import { useLanguage } from '../i18n'
import { useRef, useState } from 'react'
import { BellOff, ChevronRight, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { assessmentLabel, Dialog, Photo, PhotoPreview, usePhoto } from '../components/ReportReview'
import RefreshButton from '../components/RefreshButton'
import { EmptyState, ErrorBox, Loading, RiskBadge, StatusBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'

const riskLevels = ['low', 'moderate', 'high']
const reference = id => `INC-${String(id).padStart(3, '0')}`

function incidentLocation(incident, t) {
  if (incident.village_name) return incident.village_name
  if (Number.isFinite(incident.lat) && Number.isFinite(incident.lon)) return `${incident.lat.toFixed(5)}, ${incident.lon.toFixed(5)}`
  return t('Location unavailable')
}

function animal(incident, term) {
  return term('species', incident.species, incident.species === 'unidentified' ? 'Unknown animal' : incident.species_name)
}

function DetailField({ label, children, wide }) {
  if (children == null || children === '') return null
  return <div className={`operations-field ${wide ? 'sm:col-span-2' : ''}`}><dt>{label}</dt><dd>{children}</dd></div>
}

function IncidentDetail({ id, close, reload }) {
  const { t, dateTime, term } = useLanguage()
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
  const title = report?.title || t('Incident details')
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
          <RefreshButton onClick={detail.reload} loading={detail.loading} label={t('Refresh incident details')} />
          <button type="button" aria-label={t('Close')} title={t('Close')} className="operations-control" onClick={close} disabled={busy}><X size={18} /></button>
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
    {detail.loading && !incident && <Loading label={t('Loading incident…')} height="h-24" />}
    {detail.error && <ErrorBox message={detail.error} onRetry={detail.reload} />}
    {incident && <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="report-review-panel" aria-labelledby="incident-information">
          <h2 id="incident-information" className="font-semibold">{t('Incident information')}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailField label={t('Confirmed animal')}>{animal(incident, term)}</DetailField>
            <DetailField label={t('Category')}>{term('category', incident.category)}</DetailField>
            <DetailField label={t('Location')}>{incidentLocation(incident, t)}</DetailField>
            <DetailField label={t('Location source')}>{report?.lat != null && report.lon != null ? 'GPS'
              : incident.village_name ? t('Village center') : null}</DetailField>
            <DetailField label={t('Published')}>{alert?.created_at && dateTime(alert.created_at)}</DetailField>
            <DetailField label={t('Linked report')}>{report && <Link className="operations-link break-all" to={`/reports?report=${report.id}`}>{report.reference_code}</Link>}</DetailField>
          </dl>
          {report?.image_url && <div className="report-review-section">
            <h3 className="mb-2 font-medium">{t('Private evidence')}</h3>
            <PhotoPreview kind="original" photo={photo} onOpen={() => setViewPhoto(true)} />
          </div>}
        </section>
        <section className="report-review-panel" aria-labelledby="incident-management">
          <h2 id="incident-management" className="font-semibold">{active ? t('Incident management') : t('Incident record')}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailField label={t('Assessment method')}>{assessmentLabel(risk) || (risk ? t('Recorded assessment') : null)}</DetailField>
            <DetailField label={t('Automatic assessment')}>{risk?.original_assessment && term('risk', risk.original_assessment.level)}</DetailField>
            <DetailField label={risk?.assessment_method === 'override' ? t('Override reason') : t('Assessment reason')} wide>{risk?.assessment_reason}</DetailField>
            <DetailField label={t('Reviewed by')}>{review?.reviewer_name}</DetailField>
            <DetailField label={t('Reviewed')}>{review?.at && dateTime(review.at)}</DetailField>
            <DetailField label={t('Review notes')} wide>{review?.note}</DetailField>
            <DetailField label={t('Resolved by')}>{incident.resolved_by}</DetailField>
            <DetailField label={t('Resolved')}>{incident.resolved_at && dateTime(incident.resolved_at)}</DetailField>
            <DetailField label={t('Resolution notes')} wide>{incident.resolution_note}</DetailField>
            <DetailField label={t('Resolution shared with citizen')} wide>{incident.citizen_resolution_note}</DetailField>
          </dl>
          {active && <fieldset disabled={busy} className="report-review-section report-review-form">
            <label htmlFor="incident-resolution-notes">{t('Resolution notes')}</label>
            <textarea id="incident-resolution-notes" rows={2} maxLength={1000} value={note}
              placeholder={t('Optional, authority only')} onChange={event => setNote(event.target.value)} />
            {report?.is_citizen_submission && <>
              <label htmlFor="incident-shared-notes">{t('Resolution for citizen (optional)')}</label>
              <textarea id="incident-shared-notes" rows={2} maxLength={1000} value={citizenNote}
                onChange={event => setCitizenNote(event.target.value)} />
            </>}
            {confirm && <p>{t('Resolve this incident and close its public alert?')}</p>}
            <div className="report-review-actions">
              {confirm ? <>
                <button type="button" className="report-review-action is-approve" onClick={resolve}>{busy ? t('Resolving…') : t('Confirm resolution')}</button>
                <button type="button" className="report-review-action" onClick={() => setConfirm(false)}>{t('Cancel')}</button>
              </> : <button type="button" className="report-review-action is-approve" onClick={() => setConfirm(true)}>{t('Resolve incident')}</button>}
            </div>
          </fieldset>}
          {resolved && <p role="status" className="mt-3 text-sm text-success-7">{t('Incident resolved.')}</p>}
          {error && <div className="mt-3"><ErrorBox message={error} /></div>}
        </section>
      </div>
      {events.length > 0 && <section className="report-review-panel" aria-labelledby="incident-activity">
        <h2 id="incident-activity" className="font-semibold">{t('Activity')}</h2>
        <ol className="mt-2 divide-y divide-line-6">
          {events.map(event => <li key={event.title} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <span>{t(event.title)}{event.actor && <span className="text-muted-3"> · {event.actor}</span>}</span>
            <time className="text-xs text-muted-3" dateTime={event.at}>{dateTime(event.at)}</time>
          </li>)}
        </ol>
      </section>}
    </div>}
    {viewPhoto && photo.url && <Dialog className="report-review-lightbox" labelledBy="incident-photo-title" onClose={() => setViewPhoto(false)}>
      <header className="report-review-nav">
        <h2 id="incident-photo-title">{t('Private evidence')}</h2>
        <button type="button" onClick={() => setViewPhoto(false)} aria-label={t('Close photo')}><X aria-hidden="true" /></button>
      </header>
      <div className="report-review-photo"><Photo photo={photo} alt={t('Enlarged original evidence')} /></div>
    </Dialog>}
  </Dialog>
}

export default function IncidentAlerts() {
  const { t, dateTime, term } = useLanguage()
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
      <h1>{t('Alerts')}</h1>
      <RefreshButton onClick={reload} loading={loading} label={t('Refresh incidents')} />
    </header>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2" aria-label={t('Incident status')}>
        {Object.entries({ active: 'Active incidents', resolved: 'Resolved history' }).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={status === value} onClick={() => filter('status', value)}
            className={`rounded-lg px-3 py-2 ${status === value ? 'btn-lime' : 'btn-outline'}`}>{t(label)}</button>)}
      </div>
      <label className="text-sm">{t('Risk level')}
        <select className="field ml-2 inline-block !w-auto !py-2" value={risk} onChange={event => filter('risk', event.target.value)}>
          <option value="">{t('All risk levels')}</option>
          {riskLevels.map(value => <option value={value} key={value}>{term('risk', value)}</option>)}
        </select>
      </label>
      <Link className="operations-link self-center lg:ml-auto" to="/risk">{t('Detection alerts')}</Link>
    </div>
    {error && <ErrorBox message={error} onRetry={reload} />}
    {!data && loading && <Loading label={t('Loading incidents…')} height="h-24" />}
    {data && !data.items.length && (
      <EmptyState
        icon={BellOff}
        title={risk ? t('No matching incidents') : t(status === 'resolved' ? 'No resolved incidents' : 'No active incidents')}
      />
    )}
    <ul className="grid gap-3">
      {data?.items.map(incident => <li key={incident.id}>
        <button type="button" className="operations-incident-row" data-risk={incident.severity} onClick={() => filter('incident', incident.id)}>
          <span className="operations-item-title">
            <span className="block text-xs text-muted-3">{reference(incident.id)}</span>
            <strong className="block text-base text-ink">{incident.title || animal(incident, term)}</strong>
            <span className="block text-sm text-secondary-9">{animal(incident, term)} · {incidentLocation(incident, t)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {incident.published_at && <time dateTime={incident.published_at} className="text-xs text-muted-3">{dateTime(incident.published_at)}</time>}
            <RiskBadge level={incident.severity} />
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        </button>
      </li>)}
    </ul>
    {selected && <IncidentDetail key={selected} id={selected} close={() => filter('incident', null)} reload={reload} />}
  </>
}
