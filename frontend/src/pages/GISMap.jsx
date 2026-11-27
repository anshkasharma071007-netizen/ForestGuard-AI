import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Camera,
  Crosshair,
  Eye,
  EyeOff,
  Filter,
  Layers3,
  MapPin,
  MousePointerClick,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TreePine,
  Users,
  X,
} from 'lucide-react'
import MapView from '../components/MapView'
import { Badge, ErrorBox, MetricBar, PageHeader, RiskBadge, SectionTitle, SpeciesTag } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { mediaUrl } from '../api/client'
import {
  RISK_COLOR,
  SPECIES_COLOR,
  confidencePercent,
  formatDateTime,
  titleCase,
} from '../utils/format'

const SPECIES = [
  ['tiger', 'Tiger'],
  ['leopard', 'Leopard'],
  ['elephant', 'Elephant'],
  ['sloth_bear', 'Sloth bear'],
  ['wild_boar', 'Wild boar'],
  ['deer', 'Deer'],
  ['unidentified', 'Unknown'],
]

const LAYER_GROUPS = [
  {
    title: 'Habitat & settlements',
    items: [
      { key: 'forest', label: 'Forest boundaries', icon: TreePine },
      { key: 'villages', label: 'Village boundaries', icon: Users },
      { key: 'alertCoverage', label: 'Alert coverage radius', icon: ShieldAlert },
    ],
  },
  {
    title: 'Risk intelligence',
    items: [
      { key: 'riskZones', label: 'Indicative risk zones', icon: Layers3 },
      { key: 'tracks', label: 'Inferred movement paths', icon: Crosshair },
    ],
  },
  {
    title: 'Observations',
    items: [
      { key: 'detections', label: 'Wildlife detections', icon: Eye },
      { key: 'cameras', label: 'Camera stations', icon: Camera },
      { key: 'incidents', label: 'Incident reports', icon: MapPin },
      { key: 'guards', label: 'Guard positions', icon: Users },
    ],
  },
]

const DEFAULT_LAYERS = {
  forest: true,
  villages: true,
  alertCoverage: false,
  riskZones: false,
  tracks: false,
  detections: false,
  cameras: false,
  incidents: true,
  guards: false,
}

export default function GISMapPage() {
  const [searchParams] = useSearchParams()
  const [species, setSpecies] = useState([])
  const [risk, setRisk] = useState([])
  const [days, setDays] = useState(45)
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [selected, setSelected] = useState(null)
  const [focus, setFocus] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    species.forEach((value) => params.append('species', value))
    risk.forEach((value) => params.append('risk', value))
    params.set('days', String(days))
    params.set('operational', 'true')
    return params.toString()
  }, [species, risk, days])

  const { data, loading, error, reload } = useApi(`/api/map/layers?${query}`, { interval: 6000 })
  const requestedDetection = searchParams.get('detection')
  const detail = useApi(selected ? `/api/detections/${selected.id}` : null, {
    enabled: Boolean(selected),
  })

  useEffect(() => {
    if (!data?.detections?.length) return
    if (requestedDetection) {
      const found = data.detections.find((item) => String(item.id) === requestedDetection)
      if (found) {
        setSelected(found)
        setLayers((current) => current.detections ? current : { ...current, detections: true })
      }
    }
  }, [data, requestedDetection])

  const riskCounts = useMemo(() => {
    const counts = { low: 0, moderate: 0, high: 0 }
    data?.risk_zones?.features?.forEach((feature) => {
      const level = feature.properties?.level
      if (level in counts) counts[level] += 1
    })
    return counts
  }, [data])

  const toggleSpecies = (key) => {
    setSpecies((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  const detailDetection = detail.data?.detection || selected
  const riskDetail = detail.data?.risk

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Geospatial intelligence"
        title="Incident map"
        description="Forest and village boundaries, camera stations, wildlife detections, incidents, guard positions and indicative risk zones — on one interactive map."
        actions={
          <>
            <Badge tone="neutral">
              <MapPin className="h-3 w-3" /> Pench Reserve
            </Badge>
            <button type="button" className="btn-outline" onClick={reload}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh layers
            </button>
          </>
        }
      />

      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-9">
          <Filter className="h-3.5 w-3.5" /> Species
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SPECIES.map(([key, label]) => {
            const active = !species.length || species.includes(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSpecies(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition ${
                  active
                    ? 'border-success-line-2 bg-raised text-secondary-2'
                    : 'border-line-9 bg-inset-2 text-secondary-15'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SPECIES_COLOR[key] }} />
                {label}
              </button>
            )
          })}
        </div>
        <div className="mx-1 hidden h-5 w-px bg-line-2 sm:block" />
        <div className="flex items-center gap-1.5">
          {[
            ['high', 'High'],
            ['moderate', 'Moderate'],
            ['low', 'Low'],
          ].map(([level, label]) => {
            const active = risk.includes(level)
            return (
              <button
                key={level}
                type="button"
                onClick={() =>
                  setRisk((current) =>
                    current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
                  )
                }
                className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition ${
                  active ? `border-transparent ${level === 'moderate' ? 'text-forest-950' : 'text-white'}` : 'border-line-2 bg-raised text-secondary-15'
                }`}
                style={active ? { background: RISK_COLOR[level] } : undefined}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="rounded-lg border border-control-line-3 bg-raised px-2.5 py-1.5 text-[10.5px] font-medium text-secondary-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={45}>Last 45 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          {(species.length || risk.length) > 0 && (
            <button
              type="button"
              className="text-[10.5px] font-semibold text-success-7 hover:underline"
              onClick={() => {
                setSpecies([])
                setRisk([])
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {data && <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="field-label flex items-center gap-3">Active incidents
          <select className="field" defaultValue="" onChange={(event) => {
            const incident = data.incidents.find(item => String(item.id) === event.target.value)
            if (!incident) return
            setLayers(current => ({ ...current, incidents: true }))
            setFocus([incident.lat, incident.lon])
          }}>
            <option value="">{data.incidents.length ? 'Center map on an incident' : 'No active incidents match'}</option>
            {data.incidents.map(incident => <option key={incident.id} value={incident.id}>
              {incident.title || incident.species_name || 'Incident'} · {titleCase(incident.severity)} risk
            </option>)}
          </select>
        </label>
        <Link to="/alerts" className="btn-outline">Open alerts</Link>
      </div>}

      {error && <ErrorBox message={error} onRetry={reload} />}

      <div className="relative overflow-hidden rounded-2xl border border-control-line-3 shadow-card">
        {data ? (
          <MapView
            data={data}
            layers={layers}
            height="660px"
            focus={focus}
            selectedDetectionId={selected?.id}
            onSelectDetection={setSelected}
            className="rounded-none border-0"
            showLegend
          />
        ) : (
          <div className="flex h-[660px] items-center justify-center bg-inset-5 text-[12px] text-muted-3">
            {loading ? 'Loading geospatial layers…' : 'No map data'}
          </div>
        )}

        <div className="absolute left-4 top-4 z-[600] w-[248px] overflow-hidden rounded-xl border border-control-line-7 bg-parchment/95 shadow-card backdrop-blur">
          <button
            type="button"
            onClick={() => setPanelOpen((value) => !value)}
            className="flex w-full items-center justify-between border-b border-line-10 px-3 py-2.5"
          >
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary-15">
              <Layers3 className="h-3.5 w-3.5" /> Layers & legend
            </span>
            {panelOpen ? <EyeOff className="h-3.5 w-3.5 text-muted-9" /> : <Eye className="h-3.5 w-3.5 text-muted-9" />}
          </button>
          {panelOpen && (
            <div className="max-h-[430px] overflow-y-auto px-3 py-3">
              {LAYER_GROUPS.map((group) => (
                <div key={group.title} className="mb-3 last:mb-0">
                  <div className="mb-1.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-muted-16">
                    {group.title}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <label
                        key={item.key}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[10.5px] text-secondary-4 hover:bg-hover-white/70"
                      >
                        <input
                          type="checkbox"
                          checked={layers[item.key]}
                          onChange={() =>
                            setLayers((current) => ({ ...current, [item.key]: !current[item.key] }))
                          }
                          className="h-3 w-3 accent-success-5"
                        />
                        <item.icon className="h-3 w-3 text-muted-9" />
                        <span className="flex-1">{item.label}</span>
                        {item.key === 'detections' && (
                          <span className="font-mono text-[8.5px] text-muted-13">{data?.detections?.length || 0}</span>
                        )}
                        {item.key === 'riskZones' && (
                          <span className="font-mono text-[8.5px] text-muted-13">
                            {data?.risk_zones?.features?.length || 0}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-line-10 bg-raised/60 p-2">
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-16">Risk cells</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {[
                    ['High', riskCounts.high, RISK_COLOR.high],
                    ['Mod.', riskCounts.moderate, RISK_COLOR.moderate],
                    ['Low', riskCounts.low, RISK_COLOR.low],
                  ].map(([label, count, color]) => (
                    <div key={label} className="rounded bg-inset-12 px-1.5 py-1 text-center">
                      <div className="flex items-center justify-center gap-1 text-[8px] uppercase tracking-wider text-muted-11">
                        <span className="h-1.5 w-1.5 rounded-sm" style={{ background: color }} /> {label}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] font-semibold text-secondary-3">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 rounded-lg bg-inset-1 px-2 py-1.5 text-[8.5px] leading-relaxed text-muted-9">
                Empty habitat cells are omitted. Zones are indicative prioritisation aids, not predictions.
              </div>
            </div>
          )}
        </div>

        <div className="absolute right-4 top-4 z-[600] hidden items-center gap-2 rounded-lg border border-control-line-7 bg-parchment/95 px-2.5 py-1.5 shadow-card backdrop-blur sm:flex">
          <MousePointerClick className="h-3 w-3 text-muted-9" />
          <span className="text-[9.5px] font-medium text-secondary-15">Select a marker for its record</span>
        </div>

        {selected && (
          <div className="absolute bottom-3 right-3 top-3 z-[650] w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-xl border border-control-line-7 bg-parchment/97 shadow-lift backdrop-blur">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-line-10 bg-parchment/95 px-4 py-3 backdrop-blur">
              <div>
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-muted-16">
                  Detection record #{detailDetection?.id}
                </div>
                <div className="mt-0.5 font-display text-[18px] text-ink">{detailDetection?.species_name}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-9 hover:bg-hover-1 hover:text-ink"
                onClick={() => setSelected(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              {(detailDetection?.annotated_url || detailDetection?.image_url) && (
                <img
                  src={mediaUrl(detailDetection.annotated_url || detailDetection.image_url)}
                  alt={`${detailDetection.species_name} evidence`}
                  className="h-40 w-full rounded-lg border border-control-line-7 object-cover"
                />
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <RiskBadge level={detailDetection?.risk_level} score={detailDetection?.risk_score} />
                <Badge tone={detailDetection?.is_simulated ? 'neutral' : 'forest'}>
                  {detailDetection?.is_simulated ? 'station record' : 'uploaded analysis'}
                </Badge>
                {detailDetection?.risk_basis === 'confirmed_movement' && (
                  <Badge tone="danger">movement-supported</Badge>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ['Confidence', confidencePercent(detailDetection?.confidence)],
                  ['Species conf.', confidencePercent(detailDetection?.species_confidence)],
                  ['Station', detailDetection?.camera_code || 'Uploaded'],
                  ['Observed', formatDateTime(detailDetection?.detected_at)],
                  ['Nearest village', detailDetection?.nearest_village || 'Unavailable'],
                  ['Distance', Number.isFinite(detailDetection?.distance_km) ? `${detailDetection.distance_km} km` : 'Unavailable'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-inset-2 px-2.5 py-2">
                    <div className="text-[8px] uppercase tracking-[0.12em] text-muted-16">{label}</div>
                    <div className="mt-0.5 text-[10.5px] font-semibold text-secondary-3">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between rounded-lg bg-inset-2 px-2.5 py-2 font-mono text-[9.5px] text-secondary-15">
                <span>{detailDetection?.lat?.toFixed(5)}, {detailDetection?.lon?.toFixed(5)}</span>
                <span className="uppercase">{detailDetection?.zone}</span>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-16">
                  <Sparkles className="h-3 w-3" /> Why this score
                </div>
                {riskDetail?.components ? (
                  <div className="mt-2 space-y-2">
                    {riskDetail.components.map((component) => (
                      <MetricBar
                        key={component.key}
                        label={`${component.label} · ${component.detail}`}
                        value={component.points}
                        color={component.key === 'movement' ? '#C2410C' : '#2F7250'}
                        suffix=" pts"
                      />
                    ))}
                    <div className="text-[9px] leading-relaxed text-muted-9">
                      {riskDetail.basis_label}. {riskDetail.reason}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 shimmer h-20 rounded-lg" />
                )}
              </div>

              {detail.data?.track && (
                <div className="mt-3 rounded-lg border border-line-8 bg-raised/70 p-2.5">
                  <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-16">
                    Inferred track #{detail.data.track.id}
                  </div>
                  <div className="mt-1 text-[10px] text-secondary-8">
                    {titleCase(detail.data.track.direction)} · {detail.data.track.distance_km} km ·{' '}
                    {detail.data.track.point_count} camera points
                  </div>
                </div>
              )}

              <div className="mt-3 text-[8.5px] leading-relaxed text-muted-13">
                Coordinates are shown only inside the authenticated authority console. Public community views do not
                receive this precision.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card p-5 xl:col-span-8">
          <SectionTitle title="How to read this map" subtitle="Every visual layer is explicitly labelled" />
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {[
              ['Risk zones', 'Grid cells combine the strongest recent detection near a village with a small village-exposure term. They are indicative, not continuous animal distributions.'],
              ['Movement paths', 'Sequential camera observations linked over space and time indicating corridor movement.'],
              ['Boundaries', 'Compartment perimeter and adjacent village buffer zones for risk computation.'],
              ['Public privacy', 'Camera positions, exact detection coordinates and guard positions stay inside this authenticated console.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-line-10 bg-inset-14 p-3">
                <div className="text-[11px] font-semibold text-ink">{title}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-muted-5">{detail}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5 xl:col-span-4">
          <SectionTitle title="Visible signals" subtitle={`${days}-day window`} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ['Detections', data?.detections?.length || 0],
              ['Risk cells', data?.risk_zones?.features?.length || 0],
              ['Villages', data?.villages?.length || 0],
              ['Camera stations', data?.cameras?.length || 0],
              ['Inferred tracks', data?.tracks?.length || 0],
              ['Incidents', data?.incidents?.length || 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line-10 bg-raised/60 px-3 py-2.5">
                <div className="text-[8.5px] uppercase tracking-[0.12em] text-muted-16">{label}</div>
                <div className="mt-0.5 font-display text-[20px] text-ink">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-inset-1 p-2.5 text-[9.5px] leading-relaxed text-muted-5">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-9" />
            Alerts are generated only when a detection crosses the configured score threshold and a village falls
            inside the alert radius.
          </div>
        </section>
      </div>
    </div>
  )
}
