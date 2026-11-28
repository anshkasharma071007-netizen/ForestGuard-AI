import { useLanguage } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Check, ChevronDown, ClipboardList, History, ImageIcon, Info,
  LoaderCircle, LockKeyhole, RefreshCw, ScanEye, ShieldCheck, UserRound, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { titleCase } from '../utils/format'
import { ErrorBox, RiskBadge, StatusBadge } from './ui'
import './report-review.css'

export const analysisLabels = {
  no_photo: 'No photo',
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  unavailable: 'Unavailable',
  failed: 'Failed',
}

const analysisMessages = {
  no_photo: 'No photograph submitted',
  queued: 'Analysis queued',
  processing: 'Analysis in progress',
  completed: 'Analysis completed',
  unavailable: 'Analysis unavailable',
  failed: 'Analysis failed',
}

const reviewLabels = { verified: 'Report approved', rejected: 'Report rejected', forwarded: 'Report forwarded' }

export function Dialog({ className, labelledBy, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return <dialog ref={ref} className={className} aria-labelledby={labelledBy}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX >= bounds.right ||
          event.clientY < bounds.top || event.clientY >= bounds.bottom) onClose()
    }}>
    {children}
  </dialog>
}

function Heading({ id, icon: Icon, children }) {
  return <h2 className="report-review-heading" id={id}><Icon aria-hidden="true" />{children}</h2>
}

function Field({ label, children, wide }) {
  if (children == null || children === '') return null
  return <div className={wide ? 'report-review-wide' : undefined}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
}

function ReporterContact({ contact }) {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  const phone = contact?.match(/^(\+\d{1,3})? ?(\d{2})\d{6}(\d{2})$/)
  const masked = phone && [phone[1], `${phone[2]}••••••${phone[3]}`].filter(Boolean).join(' ')
  return <Field label={contact && !phone ? t('Contact') : t('Phone number')}>
    {phone ? <button type="button" className="report-review-contact"
      aria-label={visible ? t('Hide phone number') : t('Show phone number')}
      title={visible ? t('Hide phone number') : t('Show phone number')}
      onClick={() => setVisible(value => !value)}>
      {visible ? contact : masked}
    </button> : contact}
  </Field>
}

export function usePhoto(path) {
  const [photo, setPhoto] = useState({})
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    let url
    api.get(path, { responseType: 'blob', signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      url = URL.createObjectURL(data)
      const image = new Image()
      image.src = url
      return image.decode().then(() => {
        if (!controller.signal.aborted) setPhoto({ url, width: image.naturalWidth, height: image.naturalHeight })
      })
    }).catch(error => {
      if (!controller.signal.aborted) setPhoto({
        error: error.response?.status === 404 ? 'Photo unavailable.' : 'Could not open the photograph.',
      })
    })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, attempt])

  function retry() {
    setPhoto({})
    setAttempt(value => value + 1)
  }
  return { ...photo, retry }
}

export function Photo({ photo, detections, alt }) {
  const { width, height, url } = photo
  return <span className="report-review-image" style={{ '--photo-ratio': width / height }}>
    <img src={url} alt={alt} draggable="false" />
    {detections?.map(({ bbox, is_full_frame }, index) => {
      if (is_full_frame || bbox?.length !== 4) return null
      const [left, top, right, bottom] = bbox
      return <span aria-hidden="true" key={index} className="report-review-detection-box"
        style={{ left: `${100 * left / width}%`, top: `${100 * top / height}%`,
          width: `${100 * (right - left) / width}%`, height: `${100 * (bottom - top) / height}%` }} />
    })}
  </span>
}

export function PhotoPreview({ kind, photo, detections, onOpen, empty, processing }) {
  const { t } = useLanguage()
  const original = kind === 'original'
  const Icon = original ? ImageIcon : ScanEye
  const alt = original ? 'Submitted incident evidence' : 'Model-generated detection preview'
  const label = original ? 'Enlarge original photograph' : 'Enlarge detection preview'
  const className = `report-review-photo report-review-photo--${kind}`
  if (processing) return <div className={className} role="status" aria-busy="true">
    <div className="report-review-photo-message">
      <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
      <p>{t('Analysing image…')}</p>
    </div>
  </div>
  if (!empty && photo.url) return <button type="button" className={className} aria-label={label} title={label}
    onClick={() => onOpen(kind)}><Photo photo={photo} detections={detections} alt={alt} /></button>
  return <div className={className}>
    <div className="report-review-photo-message">
      <Icon aria-hidden="true" />
      <p>{empty || (photo.error ? t(photo.error) : t('Loading photograph…'))}</p>
      {!empty && photo.error &&
        <button type="button" className="report-review-link" onClick={photo.retry}>{t('Retry loading photo')}</button>}
    </div>
  </div>
}

function coordinates(lat, lon) {
  const degrees = (value, positive, negative) => `${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`
  return `${degrees(lat, 'N', 'S')}, ${degrees(lon, 'E', 'W')}`
}

function CitizenSubmission({ report, photo, onOpen }) {
  const { t, term } = useLanguage()
  const hasGps = report.lat != null && report.lon != null
  return <section className="report-review-panel" aria-labelledby="report-submission">
    <Heading id="report-submission" icon={ClipboardList}>{t('Citizen submission')}</Heading>
    <dl className="report-review-fields report-review-section">
      <Field label={t('Category')}>{term('category', report.category)}</Field>
      <Field label={t('Reported animal')}>{term('species', report.species, report.species === 'unidentified' ? 'Unknown animal' : report.species_name)}</Field>
      <Field label={t('Location')}>{report.village_name || (hasGps ? t('Reported GPS location') : null)}</Field>
      <Field label={t('Location source')}>{hasGps ? t('GPS coordinates') : report.village_name ? t('Selected village') : null}</Field>
      <Field label={t('Coordinates')} wide>{hasGps ? coordinates(report.lat, report.lon) : null}</Field>
      <Field label={t('Description')} wide>{report.description || null}</Field>
    </dl>
    <div className="report-review-section">
      <h3 className="report-review-subheading"><UserRound aria-hidden="true" />{t('Reporter information')}</h3>
      <dl className="report-review-fields">
        <Field label={t('Full name')}>{report.reporter_name}</Field>
        <ReporterContact contact={report.contact} />
      </dl>
    </div>
    <div className="report-review-section">
      <h3 className="report-review-subheading">{t('Photographic evidence')}</h3>
      <PhotoPreview kind="original" photo={photo} onOpen={onOpen} empty={!report.image_url && t('No photograph submitted')} />
      {report.image_url && <p className="report-review-caption"><LockKeyhole aria-hidden="true" />{t('Private evidence · Authority access only')}</p>}
    </div>
  </section>
}

function confidence(score) {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function Analysis({ report, photo, detections, speciesName, onOpen, busy, retry }) {
  const { t } = useLanguage()
  const [prediction, ...otherDetections] = detections
  const completed = report.analysis_status === 'completed'
  const processing = ['queued', 'processing'].includes(report.analysis_status)
  const canRetry = retry && report.image_url && !processing && ['completed', 'failed', 'unavailable'].includes(report.analysis_status)
  const failure = ['failed', 'unavailable'].includes(report.analysis_status)
  return <section className="report-review-panel" aria-labelledby="report-analysis">
    <Heading id="report-analysis" icon={ScanEye}>{t('AI analysis')}</Heading>
    {prediction && <div className="report-review-section">
      <p className="report-review-secondary">{t('AI prediction')}</p>
        <div className="report-review-prediction">
          <strong>{speciesName(prediction.species)}</strong>
          <strong>{confidence(prediction.confidence)}%</strong>
        </div>
        <progress className="report-review-confidence" value={confidence(prediction.confidence)} max={100}
          aria-label={t('Model-reported confidence')} aria-valuetext={t('{count}% confidence', { count: confidence(prediction.confidence) })} />
        <p className="report-review-secondary">{t('Model-reported confidence')}</p>
        {otherDetections.length > 0 && <ul className="report-review-other">
          {otherDetections.map((animal, index) => <li key={index}>
            {speciesName(animal.species)} · {t('{count}% confidence', { count: confidence(animal.confidence) })}
          </li>)}
        </ul>}
        <p className="report-review-analysis-note"><Info aria-hidden="true" />
          <span>{t('AI predictions are unverified. Check the original photograph.')}</span>
        </p>
    </div>}
    <div className="report-review-section">
      {prediction && <h3 className="report-review-detection-title">{t('Detection evidence')}</h3>}
      <PhotoPreview kind="detection" photo={photo} detections={detections} onOpen={onOpen}
        processing={processing} empty={!report.image_url ? t('No photograph submitted')
          : failure ? t(analysisMessages[report.analysis_status])
          : completed && !prediction ? t('No animal detected') : undefined} />
      {prediction?.is_full_frame && <p className="report-review-caption">{t('Full-frame classification')}</p>}
      {canRetry && <div className="report-review-models">
        <button type="button" className="report-review-link" onClick={retry} disabled={busy}>
          {t('Retry analysis')} <RefreshCw aria-hidden="true" />
        </button>
      </div>}
    </div>
  </section>
}

function Activity({ report }) {
  const { t, date, clockTime } = useLanguage()
  const events = [
    { title: 'Report received', at: report.created_at, actor: 'Citizen submission', generatedActor: true },
    ...(report.analysis_status === 'completed' || report.analysis_finished_at ? [{
      title: analysisMessages[report.analysis_status],
      at: report.analysis_finished_at, actor: 'AI engine', generatedActor: true, highlight: report.analysis_status === 'completed',
    }] : []),
    ...report.review_history.map(event => ({
      title: reviewLabels[event.status] || titleCase(event.status), at: event.at,
      actor: event.reviewer_name, note: event.note, highlight: event.status === 'verified',
    })),
    ...(report.resolved_at ? [{
      title: 'Incident resolved', at: report.resolved_at, actor: report.resolved_by, note: report.resolution_note, highlight: true,
    }] : []),
  ].reverse().sort((a, b) => Date.parse(b.at || report.created_at) - Date.parse(a.at || report.created_at))

  return <section className="report-review-panel report-review-history" aria-labelledby="report-history">
    <Heading id="report-history" icon={History}>{t('Activity history')}</Heading>
    <ol>
      {events.map((event, index) => <li key={index} className={event.highlight ? 'is-highlighted' : undefined}>
        <p>{t(event.title)}</p>
        <p className="report-review-secondary">
          {event.at && <time dateTime={event.at}>
            {date(event.at) !== date(report.created_at) && `${date(event.at)}, `}{clockTime(event.at)}
          </time>}
          {event.at && event.actor && ' · '}{event.generatedActor ? t(event.actor) : event.actor}
        </p>
        {event.note && <p className="report-review-event-note">{event.note}</p>}
      </li>)}
    </ol>
  </section>
}

function RiskFactors({ risk }) {
  const { t, riskDetail } = useLanguage()
  return risk?.components?.length > 0 && <details className="report-review-factors">
    <summary>{t('Assessment factors')}</summary>
    <ul>
      {risk.components.map(item => <li key={item.key}>
        <span>{t(item.label)}{item.detail ? ` · ${riskDetail(item.detail)}` : ''}</span>
        <span>{item.points} {t('pts')}</span>
      </li>)}
    </ul>
  </details>
}

export function assessmentLabel(risk) {
  return {
    automatic: 'Automatic', manual: 'Manual', override: 'Manual override',
  }[risk?.assessment_method]
}

export function ReportReview({ report, title, species, onClose, reload, canReview }) {
  const { t, date, clockTime, term } = useLanguage()
  const [note, setNote] = useState('')
  const [sharedNote, setSharedNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [confirmed, setConfirmed] = useState(report.species)
  const [assessment, setAssessment] = useState(null)
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const [override, setOverride] = useState(false)
  const [riskLevel, setRiskLevel] = useState('')
  const [riskReason, setRiskReason] = useState('')
  const [decision, setDecision] = useState(null)
  const [savedReview, setSavedReview] = useState(null)
  const [preview, setPreview] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const actionInProgress = useRef(false)
  const [retryJob, setRetryJob] = useState(null)
  const photo = usePhoto(report.image_url)
  const pending = !savedReview && ['pending', 'forwarded'].includes(report.status)
  const waitingForRetry = retryJob && report.analysis_status === retryJob.previousStatus
    && report.analysis_finished_at === retryJob.previousFinishedAt
  const analysisReport = waitingForRetry ? { ...report, analysis_status: retryJob.status, analysis_finished_at: null } : report
  const detections = analysisReport.analysis_status === 'completed' ? analysisReport.analysis_results || [] : []
  const speciesName = (key) => term('species', key, species.find(item => item.key === key)?.name)
  const latestReview = ['pending', 'forwarded'].includes(report.status) && savedReview ? savedReview : report
  const status = latestReview.lifecycle_status
  const riskPreview = assessment?.animal === confirmed && assessment.attempt === previewAttempt ? assessment : null
  const manual = riskPreview?.data?.assessment_method === 'manual'
  const canOverride = riskPreview?.data?.can_override
  const useManual = manual || (canOverride && override)
  const approvalReady = riskPreview?.data && (!useManual || (riskLevel && riskReason.trim()))

  useEffect(() => {
    if (!canReview || !pending) return undefined
    const controller = new AbortController()
    api.post(`/api/reports/${report.id}/risk-preview`, { confirmed_species: confirmed }, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setAssessment({ animal: confirmed, attempt: previewAttempt, data })
      }).catch(err => {
        if (!controller.signal.aborted) setAssessment({ animal: confirmed, attempt: previewAttempt, error: errorMessage(err) })
      })
    return () => controller.abort()
  }, [canReview, confirmed, pending, previewAttempt, report.id])

  useEffect(() => {
    if (retryJob && !waitingForRetry) setRetryJob(null)
  }, [retryJob, waitingForRetry])

  async function act(action) {
    if (actionInProgress.current || (action === 'verified' && !approvalReady)
        || (action === 'rejected' && !rejectionReason.trim())) return
    actionInProgress.current = true
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      if (action === 'retry') {
        const { data } = await api.post(`/api/reports/${report.id}/retry`)
        setPreview(null)
        setRetryJob({ status: data.analysis_status, previousStatus: report.analysis_status,
          previousFinishedAt: report.analysis_finished_at })
      } else {
        const approval = action === 'verified'
        const { data } = await api.patch(`/api/reports/${report.id}`, {
          status: action, note, citizen_note: approval ? sharedNote : rejectionReason,
          ...(approval ? { confirmed_species: confirmed } : {}),
          ...(approval && useManual ? { risk_level: riskLevel, risk_reason: riskReason } : {}),
        })
        setSavedReview(data.report)
        setDecision(null)
        const persisted = data.report.risk?.level
        const changed = approval && !useManual && persisted !== riskPreview.data.risk?.level
        setFeedback(approval ? changed ? { risk: persisted }
          : 'Report approved.' : 'Report rejected.')
      }
      reload()
    } catch (err) {
      setError(errorMessage(err))
      reload()
    } finally {
      actionInProgress.current = false
      setBusy(false)
    }
  }

  function close() {
    if (!busy) onClose()
  }

  return <Dialog className="report-review" labelledBy="report-title" onClose={close}>
    <header className="report-review-header">
      <div className="report-review-nav">
        <button type="button" onClick={close} disabled={busy}><ArrowLeft aria-hidden="true" />{t('All reports')}</button>
        <button type="button" onClick={close} disabled={busy} aria-label={t('Close')}><X aria-hidden="true" /></button>
      </div>
      <p className="report-review-reference">{report.reference_code}</p>
      <div className="report-review-title">
        <h1 id="report-title">{title}</h1>
        <div className="report-review-badges">
          {report.is_simulated && <span className="report-review-simulated">{t('Simulated')}</span>}
          {status === 'pending' ? <span className="report-review-pending">{t('Pending')}</span> : <StatusBadge status={status} />}
        </div>
      </div>
      <p className="report-review-submitted">{t('Submitted')} <time dateTime={report.created_at}>
        {date(report.created_at)}, {clockTime(report.created_at)}
      </time></p>
    </header>
    <div className="report-review-columns">
      <CitizenSubmission report={report} photo={photo} onOpen={setPreview} />
      <div className="report-review-stack">
        <Analysis report={analysisReport} photo={photo} detections={detections} speciesName={speciesName}
          onOpen={setPreview} busy={busy} retry={canReview ? () => act('retry') : undefined} />
        <section className="report-review-panel" aria-labelledby="report-authority">
          <Heading id="report-authority" icon={ShieldCheck}>{t('Authority review')}</Heading>
          {pending && !canReview && <p className="report-review-section">{t('Awaiting review by a range officer.')}</p>}
          {pending && canReview ? <>
            <fieldset className="report-review-section report-review-form" disabled={busy}>
              <label htmlFor="report-confirmed-species">{t('Confirmed animal')}</label>
              <div className="report-review-select">
                <select id="report-confirmed-species" value={confirmed} onChange={event => {
                  setConfirmed(event.target.value)
                  setPreviewAttempt(value => value + 1)
                  setOverride(false)
                  setRiskLevel('')
                  setRiskReason('')
                }}>
                  {species.map(({ key, name }) => <option key={key} value={key}>{term('species', key, name)}</option>)}
                </select>
                <ChevronDown aria-hidden="true" />
              </div>
              <div className="report-review-risk">
                <h3 className="font-semibold">{t('Risk assessment')}</h3>
                {!riskPreview && <p className="report-review-secondary" role="status">{t('Calculating risk…')}</p>}
                {riskPreview?.error && <ErrorBox message={riskPreview.error} onRetry={() => setPreviewAttempt(value => value + 1)} />}
                {riskPreview?.data?.risk && <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{t('Automatic')}</span><RiskBadge level={riskPreview.data.risk.level} score={riskPreview.data.risk.score} />
                  </div>
                  {riskPreview.data.risk.missing_factors?.includes('village_proximity') &&
                    <p className="report-review-secondary">{t('Village proximity unavailable')}</p>}
                  <RiskFactors risk={riskPreview.data.risk} />
                </>}
                {manual && <p className="report-review-secondary">{t('Manual assessment required')}</p>}
                {canOverride && <label className="flex items-center gap-2">
                  <input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} />{t('Override automatic risk')}
                </label>}
                {useManual && <>
                  <label htmlFor="report-risk-level">{t('Risk level')}</label>
                  <select id="report-risk-level" className="!appearance-auto" value={riskLevel} onChange={event => setRiskLevel(event.target.value)}>
                    <option value="">{t('Select risk')}</option>
                    {['low', 'moderate', 'high'].map(level => <option key={level} value={level}>{term('risk', level)}</option>)}
                  </select>
                  <label htmlFor="report-risk-reason">{manual ? t('Assessment reason') : t('Override reason')}</label>
                  <textarea id="report-risk-reason" rows={2} maxLength={1000} value={riskReason} onChange={event => setRiskReason(event.target.value)} />
                </>}
              </div>
              <label htmlFor="report-note">{t('Review notes')}</label>
              <textarea id="report-note" rows={2} value={note} maxLength={1000}
                placeholder={t('Optional, authority only')} onChange={event => setNote(event.target.value)} />
              {decision ? <>
                <p>{decision === 'verified'
                  ? report.is_citizen_submission ? t('Approve this report and publish a public alert?') : t('Approve this report and create an incident?')
                  : t('Reject this report and share the reason with the reporter?')}</p>
                {decision === 'rejected' ? <>
                  <label htmlFor="report-rejection">{t('Rejection reason (shared with citizen)')}</label>
                  <textarea id="report-rejection" rows={2} maxLength={1000} value={rejectionReason}
                    onChange={event => setRejectionReason(event.target.value)} />
                </> : report.is_citizen_submission && <>
                  <label htmlFor="report-shared-note">{t('Note for citizen (optional)')}</label>
                  <textarea id="report-shared-note" rows={2} maxLength={1000} value={sharedNote}
                    onChange={event => setSharedNote(event.target.value)} />
                </>}
                <div className="report-review-actions">
                  <button type="button" className={`report-review-action ${decision === 'verified' ? 'is-approve' : 'is-reject'}`}
                    onClick={() => act(decision)} disabled={decision === 'rejected' ? !rejectionReason.trim() : !approvalReady}>
                    {busy ? t('Saving…') : decision === 'verified' ? t('Confirm approval') : t('Confirm rejection')}
                  </button>
                  <button type="button" className="report-review-action" onClick={() => setDecision(null)}>{t('Cancel')}</button>
                </div>
              </> : <>
                <div className="report-review-actions">
                  <button type="button" className="report-review-action is-approve" disabled={!approvalReady} onClick={() => setDecision('verified')}>
                    <Check aria-hidden="true" />{t('Approve report')}
                  </button>
                  <button type="button" className="report-review-action is-reject" onClick={() => setDecision('rejected')}>
                    <X aria-hidden="true" />{t('Reject report')}
                  </button>
                </div>
              </>}
            </fieldset>
          </> : <dl className="report-review-section report-review-fields">
            {latestReview.incident_id && <>
              <Field label={t('Confirmed animal')}>{speciesName(latestReview.confirmed_species)}</Field>
              <Field label={t('Linked incident')}><Link className="report-review-link underline"
                to={`/alerts?incident=${latestReview.incident_id}`}>{t('Incident #')}{latestReview.incident_id}</Link></Field>
              {latestReview.risk && <>
                <Field label={t('Risk')}><RiskBadge level={latestReview.risk.level} score={latestReview.risk.score} /></Field>
                <Field label={t('Method')}>{t(assessmentLabel(latestReview.risk))}</Field>
                <Field label={latestReview.risk.assessment_method === 'override' ? t('Override reason') : t('Assessment reason')} wide>
                  {latestReview.risk.assessment_reason}
                </Field>
              </>}
            </>}
            {status === 'rejected' && <Field label={t('Rejection reason')} wide>
              {latestReview.review_history.at(-1)?.citizen_note ?? latestReview.review_history.at(-1)?.note}
            </Field>}
          </dl>}
          {feedback && <p role="status" className="report-review-feedback">{typeof feedback === 'string' ? t(feedback) : t('Report approved. Updated assessment: {risk} risk.', { risk: term('risk', feedback.risk) })}</p>}
          {error && <div className="report-review-feedback"><ErrorBox message={error} /></div>}
        </section>
      </div>
    </div>
    <Activity report={{ ...analysisReport, review_history: latestReview.review_history }} />
    {preview && <Dialog className="report-review-lightbox" labelledBy="report-photo-title" onClose={() => setPreview(null)}>
      <header className="report-review-nav">
        <h2 id="report-photo-title">{preview === 'original' ? t('Original uploaded photograph') : t('Model-generated detection preview')}</h2>
        <button type="button" onClick={() => setPreview(null)} aria-label={t('Close photo')}><X aria-hidden="true" /></button>
      </header>
      <div className="report-review-photo">
        <Photo photo={photo} detections={preview === 'detection' ? detections : null} alt={preview === 'original'
          ? t('Enlarged original evidence') : t('Enlarged detection evidence')} />
      </div>
    </Dialog>}
  </Dialog>
}
