import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { Badge, ErrorBox, Loading, StatusBadge } from '../components/ui'
import { refreshAuthorityNotifications } from '../components/Layout'
import RefreshButton from '../components/RefreshButton'
import { ReportReview, analysisLabels } from '../components/ReportReview'
import { useApi } from '../hooks/useApi'
import { formatDateTime, titleCase } from '../utils/format'

function location(report) {
  const gps = report.lat != null && report.lon != null && [report.lat, report.lon].map(n => n.toFixed(5)).join(', ')
  const village = report.village_name && (gps ? report.village_name : report.village_name + ' (village centre)')
  return [village, gps].filter(Boolean).join(' · ') || 'Location unavailable'
}

function reportTitle(report) {
  return report.title || (report.species_name + ' · ' + titleCase(report.category))
}

export default function IncidentReports() {
  const { data, loading, error, reload } = useApi('/api/reports', { interval: 6000 })
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [readError, setReadError] = useState('')
  const selected = params.get('report')
  const status = params.get('status') || ''
  const unreadOnly = params.get('unread') === '1'
  const reports = data?.items || []
  const report = reports.find(r => String(r.id) === selected)
  const unread = report?.unread
  const filtered = reports.filter(r => (!unreadOnly || (r.unread && !r.is_simulated)) && (!status || r.lifecycle_status === status)
    && [r.title, r.species_name, r.confirmed_species_name, r.category, r.reference_code, location(r), r.description]
      .some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))

  useEffect(() => {
    setReadError('')
    if (!selected || !unread) return
    const controller = new AbortController()
    api.post(`/api/reports/${selected}/read`, null, { signal: controller.signal })
      .then(async () => {
        if (controller.signal.aborted) return
        refreshAuthorityNotifications()
        await reload()
      }).catch(e => { if (!controller.signal.aborted) setReadError(errorMessage(e)) })
    return () => controller.abort()
  }, [selected, unread, reload])

  function updateParams(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return <>
    <header className="operations-heading">
      <h1>Reports</h1>
      <RefreshButton onClick={reload} loading={loading} label="Refresh reports" />
    </header>
    <section className="operations-panel space-y-3 p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <label className="field-label">Search reports<input type="search" className="field mt-1" value={search}
          onChange={event => setSearch(event.target.value)} placeholder="Title, animal, location or reference" /></label>
        <label className="field-label">Status<select aria-label="Status" className="field mt-1" value={status}
          onChange={event => updateParams('status', event.target.value)}>
          <option value="">All statuses</option>
          {['pending', 'under_work', 'rejected', 'resolved', 'closed'].map(value =>
            <option value={value} key={value}>{titleCase(value)}</option>)}
        </select></label>
        <label className="mb-2 flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={unreadOnly} onChange={event => updateParams('unread', event.target.checked ? '1' : null)} />
          Unread only
        </label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {readError && <ErrorBox message={readError} />}
      {!data && loading && <Loading label="Loading reports…" height="h-24" />}
      {data && !filtered.length && <p className="py-3 text-sm text-muted-3">
        {unreadOnly && !search && !status ? 'No unread reports' : reports.length ? 'No matching reports' : 'No reports received'}
      </p>}
      <div className="divide-y divide-line-6">
        {filtered.map(r => <button key={r.id} onClick={() => updateParams('report', r.id)}
          type="button" className="operations-item">
          <span className="operations-item-title"><strong>{reportTitle(r)}</strong>
            <span className="block text-sm text-muted-3">{titleCase(r.category)} · {r.species_name} · {location(r)}</span>
            <span className="text-xs text-muted-3">{formatDateTime(r.created_at)} · {r.reference_code}</span></span>
          {r.unread && <Badge tone="forest">Unread</Badge>}
          {r.is_simulated && <Badge>Simulated</Badge>}
          {r.image_url && ['queued', 'processing', 'failed', 'unavailable'].includes(r.analysis_status) && <Badge>{analysisLabels[r.analysis_status]}</Badge>}
          <StatusBadge status={r.lifecycle_status} />
        </button>)}
      </div>
    </section>
    {selected && data && !report && <ErrorBox message="Report not found." />}
    {report && <ReportReview key={report.id} report={report} title={reportTitle(report)} species={data.species}
      onClose={() => updateParams('report', null)} reload={reload} />}
  </>
}
