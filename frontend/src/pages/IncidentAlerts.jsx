import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { EmptyState, ErrorBox, Loading, Modal, PageHeader, RiskBadge, StatusBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { formatDateTime, titleCase } from '../utils/format'

function location(incident) {
  return incident.village_name || `${incident.lat.toFixed(5)}, ${incident.lon.toFixed(5)}`
}

function IncidentDetail({ id, close, reload }) {
  const detail = useApi(`/api/incidents/${id}`, { interval: 6000 })
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { incident, report, alert } = detail.data || {}

  async function resolve() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/api/incidents/${id}`, { status: 'resolved', note })
      setSuccess(true)
      setConfirm(false)
      detail.reload()
      reload()
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  return <Modal open title={report?.title || 'Incident details'} onClose={() => { if (!busy) close() }}>
    <div className="space-y-4 text-sm">
      {detail.loading && !detail.data && <Loading />}
      {detail.error && <ErrorBox message={detail.error} onRetry={detail.reload} />}
      {incident && <>
        <div className="flex gap-2"><StatusBadge status={success || incident.status === 'resolved' ? 'resolved' : 'under_work'} />
          <RiskBadge level={incident.severity} score={incident.risk?.score} /></div>
        <p>{incident.species === 'unidentified' ? 'Unknown' : incident.species_name} · {location(incident)}</p>
        {alert && <p>Published {formatDateTime(alert.created_at)}</p>}
        <p className="whitespace-pre-wrap">{incident.description}</p>
        {report && <Link className="btn-outline" to={`/reports?report=${report.id}`}>Open linked report</Link>}
        {incident.resolved_at && <p>Resolved {formatDateTime(incident.resolved_at)}
          {incident.resolved_by && ` by ${incident.resolved_by}`}<br />{incident.resolution_note}</p>}
        {incident.status === 'verified' && !success && <fieldset disabled={busy} className="space-y-3">
          <label className="field-label block">Resolution notes
            <textarea className="field mt-1" maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
          </label>
          {confirm ? <div className="space-y-2 rounded-lg border border-line-6 p-3">
            <p>Resolve this incident and close its public alert?</p>
            <button className="btn-primary mr-2" onClick={resolve}>{busy ? 'Resolving…' : 'Confirm resolution'}</button>
            <button className="btn-outline" onClick={() => setConfirm(false)}>Cancel</button>
          </div> : <button className="btn-primary" onClick={() => setConfirm(true)}>Resolve incident</button>}
        </fieldset>}
      </>}
      {success && <p role="status" className="text-success-7">Incident resolved.</p>}
      {error && <ErrorBox message={error} />}
    </div>
  </Modal>
}

export default function IncidentAlerts() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') === 'resolved' ? 'resolved' : 'active'
  const riskParam = params.get('risk')
  const risk = ['low', 'moderate', 'high'].includes(riskParam) ? riskParam : ''
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
    <PageHeader title="Alerts" description="Manage verified citizen incidents and review resolved cases."
      actions={<Link className="btn-outline" to="/risk">Automated detection alerts</Link>} />
    <section className="card space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">Incident status<select aria-label="Incident status" className="field mt-1" value={status} onChange={e => filter('status', e.target.value)}>
          <option value="active">Active incidents</option><option value="resolved">Resolved incidents</option>
        </select></label>
        <label className="field-label">Risk level<select aria-label="Risk level" className="field mt-1" value={risk} onChange={e => filter('risk', e.target.value)}>
          <option value="">All risk levels</option>
          {['low', 'moderate', 'high'].map(value => <option value={value} key={value}>{titleCase(value)}</option>)}
        </select></label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data && !data.items.length && <EmptyState title={`No ${status} incidents match this view`} />}
      <div className="divide-y divide-line-6">{data?.items.map(incident => <button key={incident.id}
        className="flex w-full flex-wrap items-center gap-3 py-4 text-left" onClick={() => filter('incident', incident.id)}>
        <span className="min-w-48 flex-1"><strong>{incident.title}</strong>
          <span className="block text-xs text-muted-3">{incident.species === 'unidentified' ? 'Unknown' : incident.species_name} · {location(incident)}</span>
          <span className="text-xs text-muted-3">{incident.published_at ? formatDateTime(incident.published_at) : 'No publication recorded'}</span></span>
        <RiskBadge level={incident.severity} score={incident.risk?.score} />
        <StatusBadge status={incident.status === 'resolved' ? 'resolved' : 'under_work'} />
      </button>)}</div>
    </section>
    {selected && <IncidentDetail key={selected} id={selected} close={() => filter('incident', null)} reload={reload} />}
  </>
}
