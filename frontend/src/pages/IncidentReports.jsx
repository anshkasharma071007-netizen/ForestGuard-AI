import { useLanguage } from '../i18n'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../api/client'
import { Badge, ErrorBox, Loading, StatusBadge } from '../components/ui'
import { refreshAuthorityNotifications } from '../components/Layout'
import RefreshButton from '../components/RefreshButton'
import { ReportReview, analysisLabels } from '../components/ReportReview'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { titleCase } from '../utils/format'

function location(report, t = (key) => key) {
  const gps = report.lat != null && report.lon != null && [report.lat, report.lon].map(n => n.toFixed(5)).join(', ')
  const village = report.village_name && (gps ? report.village_name : report.village_name + t(' (village centre)'))
  const generated = gps && report.location_label === `Map point (${gps})`
  const label = generated ? t('Map point ({lat}, {lon})', { lat: report.lat.toFixed(5), lon: report.lon.toFixed(5) }) : report.location_label
  return [label || village, gps].filter(Boolean).join(' · ') || t('Location unavailable')
}

function reportTitle(report, term = (_group, value, fallback) => fallback || titleCase(value)) {
  return report.title || (term('species', report.species, report.species_name) + ' · ' + term('category', report.category))
}

export default function IncidentReports() {
  const { t, dateTime, term } = useLanguage()
  const { isAdmin, canReview, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const unassigned = isAdmin && params.get('queue') === 'unassigned'
  const { data, loading, error, reload } = useApi(unassigned ? '/api/reports?unassigned_only=true' : '/api/reports',
    { interval: 6000, deps: [user?.id] })
  const [search, setSearch] = useState('')
  const [readError, setReadError] = useState('')
  const selected = params.get('report')
  const status = params.get('status') || ''
  const unreadOnly = params.get('unread') === '1'
  const reports = data?.items || []
  const report = reports.find(r => String(r.id) === selected)
  const unread = report?.unread
  const filtered = reports.filter(r => (!unreadOnly || (r.unread && !r.is_simulated)) && (!status || r.lifecycle_status === status)
    && [r.title, r.species_name, r.confirmed_species_name, term('species', r.species, r.species_name),
      term('species', r.confirmed_species, r.confirmed_species_name), r.category, term('category', r.category), r.reference_code, location(r), r.description]
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
      <h1>{t('Reports')}</h1>
      <RefreshButton onClick={reload} loading={loading} label={t('Refresh reports')} />
    </header>
    <section className="operations-panel space-y-3 p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <label className="field-label">{t('Search reports')}<input type="search" className="field mt-1" value={search}
          onChange={event => setSearch(event.target.value)} placeholder={t('Title, animal, location or reference')} /></label>
        <label className="field-label">{t('Status')}<select aria-label={t('Status')} className="field mt-1" value={status}
          onChange={event => updateParams('status', event.target.value)}>
          <option value="">{t('All statuses')}</option>
          {['pending', 'under_work', 'rejected', 'resolved', 'closed'].map(value =>
            <option value={value} key={value}>{term('report', value)}</option>)}
        </select></label>
        <label className="mb-2 flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={unreadOnly} onChange={event => updateParams('unread', event.target.checked ? '1' : null)} />
          {t('Unread only')}
        </label>
      </div>
      {isAdmin && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unassigned} onChange={event => updateParams('queue', event.target.checked ? 'unassigned' : null)} />
        {t('Central review queue · unassigned reports')}
      </label>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {readError && <ErrorBox message={readError} />}
      {!data && loading && <Loading label={t('Loading reports…')} height="h-24" />}
      {data && !filtered.length && <p className="py-3 text-sm text-muted-3">
        {unreadOnly && !search && !status ? t('No unread reports') : reports.length ? t('No matching reports') : t('No reports received')}
      </p>}
      <div className="divide-y divide-line-6">
        {filtered.map(r => <button key={r.id} onClick={() => updateParams('report', r.id)}
          type="button" className="operations-item">
          <span className="operations-item-title"><strong>{reportTitle(r, term)}</strong>
            <span className="block text-sm text-muted-3">{term('category', r.category)} · {term('species', r.species, r.species_name)} · {location(r, t)}</span>
            <span className="text-xs text-muted-3">{dateTime(r.created_at)} · {r.reference_code}</span></span>
          {isAdmin && r.jurisdiction_id == null && <Badge>{t('Unassigned')}</Badge>}
          {r.unread && <Badge tone="forest">{t('Unread')}</Badge>}
          {r.is_simulated && <Badge>{t('Simulated')}</Badge>}
          {r.image_url && ['queued', 'processing', 'failed', 'unavailable'].includes(r.analysis_status) && <Badge>{term('analysis', r.analysis_status, analysisLabels[r.analysis_status])}</Badge>}
          <StatusBadge status={r.lifecycle_status} />
        </button>)}
      </div>
    </section>
    {selected && data && !report && <ErrorBox message={"Report not found."} />}
    {report && <ReportReview key={report.id} report={report} title={reportTitle(report, term)} species={data.species}
      canReview={canReview} onClose={() => updateParams('report', null)} reload={reload} />}
  </>
}
