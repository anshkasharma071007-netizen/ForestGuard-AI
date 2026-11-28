import { useLanguage } from '../i18n'
import { useMemo, useState } from 'react'
import { Layers3, MapPin, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import MapView from '../components/MapView'
import EvidenceImage from '../components/EvidenceImage'
import RefreshButton from '../components/RefreshButton'
import { ErrorBox, Loading, RiskBadge } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { RISK_COLOR } from '../utils/format'

const ANIMALS = [
  ['tiger', 'Tiger'], ['leopard', 'Leopard'], ['elephant', 'Elephant'], ['sloth_bear', 'Sloth bear'],
  ['wild_boar', 'Wild boar'], ['deer', 'Deer'], ['unidentified', 'Unknown'], ['other', 'Other'],
]
const LEVELS = [['high', 'High'], ['moderate', 'Moderate'], ['low', 'Low']]
const STATUS = { pending: 'Pending review', under_work: 'Active verified', resolved: 'Resolved' }
const DEFAULT_LAYERS = {
  forest: false, cameras: false, guards: false, tracks: false, incidents: false, alertCoverage: false,
  jurisdiction: true, under_work: true, pending: true, resolved: true, riskZones: false, villages: true, detections: false,
}

export default function GISMapPage() {
  const { t, dateTime, lang, term } = useLanguage()
  const [params] = useSearchParams()
  const choices = useApi('/api/operations/map/jurisdictions', { interval: 30000 })
  const [jurisdictionId, setJurisdictionId] = useState('')
  const [animal, setAnimal] = useState('')
  const [risk, setRisk] = useState('')
  const [days, setDays] = useState('')
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [selection, setSelection] = useState(null)
  const jurisdiction = choices.data?.items.find(item => String(item.id) === jurisdictionId) ?? choices.data?.items[0]
  const map = useApi(jurisdiction ? `/api/operations/map?jurisdiction_id=${jurisdiction.id}${days ? `&days=${days}` : ''}` : null, { interval: 6000 })
  const reports = (map.data?.reports ?? []).filter(item =>
    (!animal || item.species === animal) && (!risk || item.severity === risk))
  const visible = reports.filter(item => layers[item.status])
  const detections = (map.data?.detections ?? []).filter(item =>
    (!animal || item.species === animal) && (!risk || item.risk_level === risk))
  const data = useMemo(() => {
    if (!map.data) return null
    return {
      villages: map.data.villages,
      reports: map.data.reports.filter(item => (!animal || item.species === animal) && (!risk || item.severity === risk)),
      detections: map.data.detections.filter(item => (!animal || item.species === animal) && (!risk || item.risk_level === risk)),
    }
  }, [map.data, animal, risk])
  const selected = visible.find(item => item.id === selection?.report)
  const detectionId = selection?.detection ?? (selection === null ? Number(params.get('detection')) : null)
  // Report selection takes precedence over a detection deep link.
  const detection = !selected && detections.find(item => item.id === detectionId)
  const detail = useApi(detection ? `/api/detections/${detection.id}` : null)
  const layerOptions = [
    ['jurisdiction', 'Jurisdiction boundary'],
    ['under_work', 'Active verified incidents'], ['pending', 'Pending reports'], ['resolved', 'Resolved incidents'],
    ...(map.data?.reports.some(item => item.coverage_radius_m) ? [['riskZones', 'Advisory coverage zones']] : []),
    ...(map.data?.villages.length ? [['villages', 'Registered villages']] : []),
    ...(map.data?.detections.length ? [['detections', 'Camera detections']] : []),
  ]
  const mapLayers = !layers.detections && detection ? { ...layers, detections: true } : layers
  const focus = useMemo(() => detection ? [detection.lat, detection.lon, 15] : null, [detection?.id, detection?.lat, detection?.lon])

  return <>
    <header className="operations-heading">
      <div>
        <h1>{t('Jurisdiction map')}</h1>
        {jurisdiction && <p className="mt-1 flex items-center gap-2 text-sm text-muted-3"><MapPin size={15} />{jurisdiction.name}</p>}
      </div>
      <RefreshButton onClick={() => { choices.reload(); map.reload() }} loading={map.loading || choices.loading} label={t('Refresh map')} />
    </header>
    {(choices.error || map.error) && <ErrorBox message={choices.error || map.error} onRetry={choices.error ? choices.reload : map.reload} />}
    {choices.loading && !choices.data && <Loading label={t('Loading jurisdictions…')} height="h-32" />}
    {choices.data && !jurisdiction && <div className="operations-panel p-5">{t('No map jurisdiction is assigned or available.')}</div>}
    {jurisdiction && <>
      <div className="operations-panel mb-4 flex flex-wrap gap-3 p-3">
        {choices.data.items.length > 1 && <label className="operations-map-filter">{t('Jurisdiction')}
          <select aria-label={t('Jurisdiction')} value={jurisdiction.id} onChange={event => {
            setJurisdictionId(event.target.value)
            setSelection({})
          }}>
            {choices.data.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <label className="operations-map-filter">{t('Animal')}
          <select aria-label={t('Animal')} value={animal} onChange={event => setAnimal(event.target.value)}>
            <option value="">{t('All animals')}</option>
            {ANIMALS.map(([key, name]) => <option key={key} value={key}>{lang === 'en' ? name : term('species', key)}</option>)}
          </select>
        </label>
        <label className="operations-map-filter">{t('Severity')}
          <select aria-label={t('Severity')} value={risk} onChange={event => setRisk(event.target.value)}>
            <option value="">{t('All severities')}</option>
            {LEVELS.map(([key, name]) => <option key={key} value={key}>{t(name)}</option>)}
          </select>
        </label>
        <label className="operations-map-filter">{t('History')}
          <select aria-label={t('History')} value={days} onChange={event => setDays(event.target.value)}>
            <option value="">{t('All history')}</option>
            {[7, 30, 45, 90, 365].map(value => <option key={value} value={value}>{t('Last {count} days', { count: value })}</option>)}
          </select>
        </label>
        <span className="self-end pb-1 text-xs text-muted-3">{t('Active incidents stay visible across date ranges.')}</span>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_236px]">
        <MapView data={data} jurisdiction={jurisdiction} layers={mapLayers} height="clamp(420px, 65vh, 760px)"
          showLegend={false} selectedReportId={selected?.id} onSelectReport={item => setSelection({ report: item.id })}
          selectedDetectionId={detection?.id} onSelectDetection={item => setSelection({ detection: item.id })} focus={focus} />
        <div className="grid gap-3">
          <section className="operations-panel p-4" aria-label={t('Layers and legend')}>
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Layers3 size={17} />{t('Layers & Legend')}</h2>
            {layerOptions.map(([key, label]) => <label key={key} className="flex items-center gap-2 py-1.5 text-sm">
              <input type="checkbox" checked={layers[key]} onChange={event => {
                setLayers({ ...layers, [key]: event.target.checked })
                if (key === 'detections' && !event.target.checked) setSelection({})
              }} />{t(label)}
            </label>)}
            {map.data && <>
              <h3 className="mt-3 border-t border-line-5 pt-3 text-sm font-semibold">{t('Visible incident counts')}</h3>
              <div className="space-y-1 pt-2 text-sm">
                {LEVELS.map(([key, name]) => <div key={key} className="flex items-center justify-between gap-1">
                  <span><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: RISK_COLOR[key] }} />{t(name)}</span>
                  <strong data-risk-count={key}>{visible.filter(item => item.severity === key).length}</strong>
                </div>)}
              </div>
              {!visible.length && <p className="mt-3 text-xs text-muted-3">{t('No reports match the visible layers and filters.')}</p>}
            </>}
          </section>
          {selected && <section className="operations-panel space-y-2 p-4" aria-label={t('Map report details')}>
            <header className="flex items-start justify-between gap-2">
              <h2 className="break-words font-semibold">{selected.title}</h2>
              <button aria-label={t('Close map details')} onClick={() => setSelection({})}><X size={17} /></button>
            </header>
            <p className="text-sm">{term('species', selected.species, selected.species_name)}</p>
            <p className="text-sm text-muted-3">{STATUS[selected.status]}</p>
            {selected.severity && <RiskBadge level={selected.severity} />}
            <p className="text-xs text-muted-3">{t('Reported')} {dateTime(selected.created_at)}</p>
            {selected.resolved_at && <p className="text-xs text-muted-3">{t('Resolved')} {dateTime(selected.resolved_at)}</p>}
            <EvidenceImage path={selected.image_url} alt={t('Evidence for {reference}', { reference: selected.title })} className="max-h-52 rounded-md object-contain" />
            <Link className="operations-link inline-block" to={`/reports?report=${selected.id}`}>{t('Open report')}</Link>
          </section>}
          {detection && <section className="operations-panel space-y-2 p-4" aria-label={t('Map detection details')}>
            <header className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{term('species', detection.species, detection.species_name)}</h2>
              <button aria-label={t('Close map details')} onClick={() => setSelection({})}><X size={17} /></button>
            </header>
            <RiskBadge level={detection.risk_level} score={detection.risk_score} />
            <p className="text-sm">{detection.camera_code} · {dateTime(detection.detected_at)}</p>
            <EvidenceImage path={detail.data?.annotated_url || detection.annotated_url || detection.image_url}
              alt={t('Camera evidence')} className="max-h-52 rounded-md object-contain" />
          </section>}
        </div>
      </div>
    </>}
  </>
}
