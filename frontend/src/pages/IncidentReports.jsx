import { useEffect, useState } from 'react'
import api, { errorMessage } from '../api/client'
import { Badge, EmptyState, ErrorBox, Loading, Modal, PageHeader, SectionTitle, StatusBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { titleCase } from '../utils/format'

function Evidence({ path }) {
  const [url, setUrl] = useState('')
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
  return url ? <img src={url} alt="Submitted field evidence" className="max-h-80 rounded-xl object-contain" /> : <p>Loading photo…</p>
}

function location(report) {
  const gps = report.lat != null && report.lon != null && [report.lat, report.lon].map(n => n.toFixed(5)).join(', ')
  const village = report.village_name && (gps ? report.village_name : report.village_name + ' (village centre)')
  return [village, gps].filter(Boolean).join(' · ') || 'Location unavailable'
}

export default function IncidentReports() {
  const queue = useApi('/api/reports', { interval: 6000 })
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reports = queue.data?.items || []
  const report = reports.find(r => r.id === selected)

  async function open(r) {
    setSelected(r.id)
    setNote('')
    setError('')
    if (r.unread) {
      try {
        await api.post(`/api/reports/${r.id}/read`)
        queue.reload()
      } catch (e) { setError(errorMessage(e)) }
    }
  }

  async function act(status) {
    setBusy(true)
    setError('')
    try {
      if (status === 'retry') await api.post(`/api/reports/${report.id}/retry`)
      else await api.patch(`/api/reports/${report.id}`, { status, note })
      setNote('')
      queue.reload()
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  return <>
    <PageHeader title="Incident Reports" description="Review community sightings and conflict reports." />
    <section className="card p-5">
      <SectionTitle title="Incoming reports" subtitle={queue.data && `${queue.data.summary.unread} unread · ${reports.length} total`} />
      {queue.error && <ErrorBox message={queue.error} onRetry={queue.reload} />}
      {!queue.data && queue.loading && <Loading />}
      {queue.data && !reports.length && <EmptyState title="No reports received" />}
      <div className="mt-4 divide-y divide-line-6">
        {reports.map(r => <button key={r.id} onClick={() => open(r)} className="flex w-full flex-wrap items-center gap-3 py-4 text-left">
          <span className="min-w-48 flex-1"><strong>{r.species_name} · {titleCase(r.category)}</strong>
            <span className="block text-xs text-muted-3">{location(r)} · {new Date(r.created_at).toLocaleString()}</span>
            <span className="font-mono text-xs">{r.reference_code}</span></span>
          {r.unread && <Badge tone="forest">Unread</Badge>}
          <Badge>{r.is_simulated ? 'Simulated' : 'Field report'}</Badge><StatusBadge status={r.status} />
        </button>)}
      </div>
    </section>
    {report && <Modal open title={report.title || (report.species_name + ' · ' + titleCase(report.category))} subtitle={report.reference_code}
      onClose={() => { if (!busy) setSelected(null) }}>
      <div className="space-y-4 text-sm text-ink">
        <div className="flex gap-2"><StatusBadge status={report.status} /><Badge>{report.is_simulated ? 'Simulated' : 'Field report'}</Badge></div>
        <p>{report.description}</p>
        <p>{location(report)}<br />Reported by {report.reporter_name}{report.contact && ' · ' + report.contact}</p>
        {report.image_url && <Evidence key={report.id} path={report.image_url} />}
        <SectionTitle title="Photo analysis" subtitle={titleCase(report.analysis_status.replaceAll('_', ' '))} />
        {report.analysis_results?.map((animal, i) => <div key={i}>
          {titleCase(animal.species)} · {Math.round(animal.confidence * 100)}% confidence
          <div className="text-xs">{animal.is_full_frame ? 'Full-frame classification' : 'Bounding box (pixels)'} · {animal.bbox.join(', ')}</div>
        </div>)}
        {report.analysis_status === 'completed' && !report.analysis_results?.length && <p>No animal met the model threshold.</p>}
        {report.analysis_status === 'failed' && <button className="btn" disabled={busy} onClick={() => act('retry')}>Retry photo analysis</button>}
        {report.incident_id && <p>Incident #{report.incident_id} · Risk score {report.risk?.score}</p>}
        {report.review_history.length > 0 && <section><SectionTitle title="Review history" />
          {report.review_history.map((event, i) => <div className="mt-2" key={i}><strong>{titleCase(event.status)}</strong> · {event.reviewer_name} · {new Date(event.at).toLocaleString()}<p>{event.note}</p></div>)}
        </section>}
        {!['verified', 'rejected'].includes(report.status) && <>
          <label className="field-label">Review notes<textarea className="input mt-1 w-full" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></label>
          <div className="flex gap-2">{[['verified', 'Verify'], ['forwarded', 'Forward'], ['rejected', 'Reject']].map(([status, label]) =>
            <button className={status === 'verified' ? 'btn-lime' : 'btn'} key={status} disabled={busy || report.status === status}
              onClick={() => act(status)}>{label}</button>)}</div>
        </>}
        {error && <ErrorBox message={error} />}
      </div>
    </Modal>}
  </>
}
