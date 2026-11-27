import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { Badge, EmptyState, ErrorBox, Loading, Modal, PageHeader, SectionTitle, StatusBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { formatDateTime, titleCase } from '../utils/format'

const analysisLabels = {
  no_photo: 'No photo',
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  unavailable: 'Unavailable',
  failed: 'Failed',
}

function Evidence({ path, detections }) {
  const [url, setUrl] = useState('')
  const [size, setSize] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl
    api.get(path, { responseType: 'blob', signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(data)
      setUrl(objectUrl)
    }).catch((e) => { if (!controller.signal.aborted) setError(errorMessage(e)) })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])
  if (error) return <ErrorBox message={error} />
  if (!url) return <Loading height="h-24" />
  return <div className="relative inline-block max-w-full overflow-hidden rounded-xl">
    <img src={url} alt="Submitted incident evidence" className="block max-h-80 max-w-full"
      onLoad={({ currentTarget: img }) => setSize({ width: img.naturalWidth, height: img.naturalHeight })} />
    {size && detections?.map(({ bbox, is_full_frame }, index) => {
      if (is_full_frame || bbox?.length !== 4) return null
      const [left, top, right, bottom] = bbox
      return <span aria-hidden="true" key={index} className="pointer-events-none absolute border-2 border-lime"
        style={{ left: `${100 * left / size.width}%`, top: `${100 * top / size.height}%`,
          width: `${100 * (right - left) / size.width}%`, height: `${100 * (bottom - top) / size.height}%` }} />
    })}
  </div>
}

function location(report) {
  const gps = report.lat != null && report.lon != null && [report.lat, report.lon].map(n => n.toFixed(5)).join(', ')
  const village = report.village_name && (gps ? report.village_name : report.village_name + ' (village centre)')
  return [village, gps].filter(Boolean).join(' · ') || 'Location unavailable'
}

function reportTitle(report) {
  return report.title || (report.species_name + ' · ' + titleCase(report.category))
}

function ReportDetail({ report, species, onClose, reload }) {
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(report.species)
  const [decision, setDecision] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = ['pending', 'forwarded'].includes(report.status)

  async function act(status) {
    if (busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      if (status === 'retry') await api.post(`/api/reports/${report.id}/retry`)
      else await api.patch(`/api/reports/${report.id}`, {
        status, note, ...(status === 'verified' ? { confirmed_species: confirmed } : {}),
      })
      setDecision(null)
      setNote('')
      setFeedback({ retry: 'Analysis queued.', verified: 'Report approved.', rejected: 'Report rejected.' }[status])
      reload()
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  return <Modal open title={reportTitle(report)} subtitle={report.reference_code} onClose={() => { if (!busy) onClose() }}>
    <div className="space-y-4 text-sm text-ink">
      <div className="flex gap-2"><StatusBadge status={report.lifecycle_status} />{report.is_simulated && <Badge>Simulated</Badge>}</div>
      <p>{titleCase(report.category)} · Reported species {report.species_name}</p>
      {report.description && <p className="whitespace-pre-wrap">{report.description}</p>}
      <p>{location(report)}<br />Reported by {report.reporter_name}{report.contact && ' · ' + report.contact}</p>
      {report.image_url && <Evidence path={report.image_url} detections={report.analysis_results} />}
      <SectionTitle title="Photo analysis" subtitle={analysisLabels[report.analysis_status] || titleCase(report.analysis_status)} />
      {report.analysis_results?.map((animal, index) => <div key={index}>
        {titleCase(animal.species)} · {Math.round(animal.confidence * 100)}% confidence
        <div className="text-xs text-muted-3">{animal.is_full_frame ? 'Full-frame classification' : 'Detected region'}</div>
      </div>)}
      {report.analysis_status === 'completed' && !report.analysis_results?.length && <p>No animal met the model threshold.</p>}
      {['failed', 'unavailable'].includes(report.analysis_status) &&
        <button className="btn-outline" disabled={busy} onClick={() => act('retry')}>Retry photo analysis</button>}
      {report.incident_id && <p>Confirmed species {report.confirmed_species === 'unidentified' ? 'Unknown' : report.confirmed_species_name}
        {' · '}<Link className="underline" to={`/alerts?incident=${report.incident_id}`}>Incident #{report.incident_id}</Link>
        {report.risk && ` · Risk score ${report.risk.score}`}</p>}
      {report.review_history.length > 0 && <section><SectionTitle title="Review history" />
        {report.review_history.map((event, index) => <div className="mt-2" key={index}>
          <strong>{event.status === 'verified' ? 'Approved' : titleCase(event.status)}</strong>
          {' · '}{event.reviewer_name}{' · '}{formatDateTime(event.at)}<p className="whitespace-pre-wrap">{event.note}</p>
        </div>)}
      </section>}
      {pending && <fieldset disabled={busy} className="space-y-3">
        <label className="field-label block">Confirmed species
          <select aria-label="Confirmed species" className="field mt-1" value={confirmed} onChange={event => setConfirmed(event.target.value)}>
            {species.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label className="field-label block">Review notes or rejection reason
          <textarea className="field mt-1" value={note} maxLength={1000} onChange={event => setNote(event.target.value)} />
        </label>
        {decision ? <div className="space-y-2 rounded-lg border border-line-6 p-3">
          <p>{decision === 'verified' ? 'Approve this report and publish a public alert?' : 'Reject this report and share the reason with the reporter?'}</p>
          <button className="btn-primary mr-2" onClick={() => act(decision)} disabled={decision === 'rejected' && !note.trim()}>
            {busy ? 'Saving…' : decision === 'verified' ? 'Confirm approval' : 'Confirm rejection'}
          </button>
          <button className="btn-outline" onClick={() => setDecision(null)}>Cancel</button>
        </div> : <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setDecision('verified')}>Approve</button>
          <button className="btn-outline" onClick={() => setDecision('rejected')}>Reject</button>
        </div>}
        {decision === 'rejected' && !note.trim() && <p className="text-muted-3">Enter a rejection reason to continue.</p>}
      </fieldset>}
      {feedback && <p role="status" className="text-success-7">{feedback}</p>}
      {error && <ErrorBox message={error} />}
    </div>
  </Modal>
}

export default function IncidentReports() {
  const { data, loading, error, reload } = useApi('/api/reports', { interval: 6000 })
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [readError, setReadError] = useState('')
  const selected = params.get('report')
  const status = params.get('status') || ''
  const reports = data?.items || []
  const report = reports.find(r => String(r.id) === selected)
  const unread = report?.unread
  const filtered = reports.filter(r => (!status || r.lifecycle_status === status)
    && [r.title, r.species_name, r.confirmed_species_name, r.category, r.reference_code, location(r), r.description]
      .some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))

  useEffect(() => {
    setReadError('')
    if (!selected || !unread) return
    const controller = new AbortController()
    api.post(`/api/reports/${selected}/read`, null, { signal: controller.signal })
      .then(reload).catch(e => { if (!controller.signal.aborted) setReadError(errorMessage(e)) })
    return () => controller.abort()
  }, [selected, unread, reload])

  function updateParams(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return <>
    <PageHeader title="Reports" description="Review citizen sightings and conflict reports." />
    <section className="card space-y-4 p-5">
      <SectionTitle title="Report queue" subtitle={data && `${data.summary.unread} unread · ${reports.length} total`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">Search reports<input type="search" className="field mt-1" value={search}
          onChange={event => setSearch(event.target.value)} placeholder="Title, species, location or reference" /></label>
        <label className="field-label">Status<select aria-label="Status" className="field mt-1" value={status}
          onChange={event => updateParams('status', event.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'under_work', 'rejected', 'resolved', 'closed'].map(value =>
            <option value={value} key={value}>{titleCase(value)}</option>)}
        </select></label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {readError && <ErrorBox message={readError} />}
      {!data && loading && <Loading />}
      {data && !filtered.length && <EmptyState title={reports.length ? 'No matching reports' : 'No reports received'} />}
      <div className="divide-y divide-line-6">
        {filtered.map(r => <button key={r.id} onClick={() => updateParams('report', r.id)}
          className="flex w-full flex-wrap items-center gap-3 py-4 text-left">
          <span className="min-w-48 flex-1"><strong>{reportTitle(r)}</strong>
            <span className="block text-xs text-muted-3">{titleCase(r.category)} · {r.species_name} · {location(r)}</span>
            <span className="text-xs text-muted-3">{formatDateTime(r.created_at)} · {r.reference_code}</span></span>
          {r.unread && <Badge tone="forest">Unread</Badge>}
          {r.is_simulated && <Badge>Simulated</Badge>}
          <Badge>{analysisLabels[r.analysis_status]}</Badge>
          <StatusBadge status={r.lifecycle_status} />
        </button>)}
      </div>
    </section>
    {selected && data && !report && <ErrorBox message="Report not found." />}
    {report && <ReportDetail key={report.id} report={report} species={data.species}
      onClose={() => updateParams('report', null)} reload={reload} />}
  </>
}
