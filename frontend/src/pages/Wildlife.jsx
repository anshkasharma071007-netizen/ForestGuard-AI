import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Compass,
  Footprints,
  PawPrint,
  Radar,
  Route,
  Search,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { SpeciesBars, ActivityArea, HourBars } from '../components/charts'
import { DetectionTable, TrackCard } from '../components/cards'
import MapView from '../components/MapView'
import {
  Badge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  RiskBadge,
  SectionTitle,
  SpeciesTag,
  StatCard,
} from '../components/ui'
import {
  SPECIES_COLOR,
  compactNumber,
  confidencePercent,
  directionLabel,
  formatDateTime,
  speciesImage,
  titleCase,
} from '../utils/format'

const SPECIES_FILTERS = [
  ['tiger', 'Tiger'],
  ['leopard', 'Leopard'],
  ['elephant', 'Elephant'],
  ['sloth_bear', 'Sloth bear'],
  ['wild_boar', 'Wild boar'],
  ['deer', 'Deer'],
]

export default function Wildlife() {
  const analytics = useApi('/api/analytics?days=30')
  const tracks = useApi('/api/tracks')
  const map = useApi('/api/map/layers?days=30')
  const [species, setSpecies] = useState('')
  const [risk, setRisk] = useState('')
  const [page, setPage] = useState(1)
  const [selectedTrack, setSelectedTrack] = useState(null)

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), page_size: '10' })
    if (species) params.set('species', species)
    if (risk) params.set('risk', risk)
    return params.toString()
  }, [page, species, risk])

  const detections = useApi(`/api/detections?${query}`)

  useEffect(() => {
    if (!selectedTrack && tracks.data?.items?.length) {
      const priority =
        tracks.data.items.find((track) => track.direction === 'toward_village') || tracks.data.items[0]
      setSelectedTrack(priority)
    }
  }, [tracks.data, selectedTrack])

  const handleSpecies = (key) => {
    setSpecies((current) => (current === key ? '' : key))
    setPage(1)
  }

  const handleRisk = (level) => {
    setRisk((current) => (current === level ? '' : level))
    setPage(1)
  }

  const totals = analytics.data?.totals
  const speciesRows = analytics.data?.species || []
  const totalSpeciesSignals = speciesRows.reduce((sum, row) => sum + row.count, 0)
  const trackItems = tracks.data?.items || []

  const trackMapData = useMemo(() => {
    if (!map.data) return null
    return {
      ...map.data,
      detections: [],
      cameras: [],
      incidents: [],
      guards: [],
      risk_zones: { type: 'FeatureCollection', features: [] },
    }
  }, [map.data])

  const trackFocus = selectedTrack?.points?.length
    ? [...selectedTrack.points[selectedTrack.points.length - 1], 12]
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wildlife intelligence"
        title="Species, signals and inferred movement"
        description="Detection history, species-wise activity and camera-sequence tracking — with explicit confidence and method limitations."
        actions={
          <Badge tone="neutral">
            <Radar className="h-3 w-3" /> 30-day window
          </Badge>
        }
      />

      {analytics.error && <ErrorBox message={analytics.error} onRetry={analytics.reload} />}
      {analytics.loading && !analytics.data ? (
        <Loading label="Loading species intelligence…" height="h-64" />
      ) : (
        analytics.data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Species observed"
                value={`${totals.species} / 6`}
                hint="Validated classes in the 30-day window"
                icon={PawPrint}
                tone="forest"
              />
              <StatCard
                label="Detections"
                value={compactNumber(totals.detections)}
                hint={`${totals.previous_detections} records exist before this window`}
                icon={Radar}
                tone="slate"
              />
              <StatCard
                label="High-risk signals"
                value={totals.high_risk}
                hint="Explainable scores above the high threshold"
                icon={TriangleAlert}
                tone="clay"
              />
              <StatCard
                label="Inferred tracks"
                value={totals.tracked_sequences}
                hint="Sequential camera associations, not GPS"
                icon={Route}
                tone="amber"
              />
            </section>

            <section>
              <SectionTitle
                title="Species roster"
                subtitle="Counts are a demonstration dataset, not a population estimate"
                action={<Badge tone="neutral">click to filter history</Badge>}
                className="mb-3"
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {speciesRows.map((row) => {
                  const active = species === row.key
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => handleSpecies(row.key)}
                      className={`group relative overflow-hidden rounded-xl border bg-parchment text-left transition ${
                        active ? 'border-forest-500 shadow-[0_0_0_2px_rgba(47,114,80,0.12)]' : 'border-[#e2ddce] hover:border-[#c9d6c3]'
                      }`}
                    >
                      <div className="relative h-[104px] overflow-hidden bg-forest-900">
                        <img
                          src={speciesImage(row.key)}
                          alt={row.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/85 via-forest-950/10 to-transparent" />
                        <div className="absolute bottom-2 left-2.5 right-2 flex items-end justify-between">
                          <span className="text-[10.5px] font-semibold leading-tight text-white">{row.name}</span>
                          <span className="font-mono text-[14px] font-bold text-lime">{row.count}</span>
                        </div>
                        <span
                          className="absolute left-2 top-2 h-2 w-2 rounded-full ring-2 ring-white/50"
                          style={{ background: SPECIES_COLOR[row.key] }}
                        />
                      </div>
                      <div className="p-2.5">
                        <div className="flex items-center justify-between text-[9px] text-[#8d938a]">
                          <span>{row.share}% of records</span>
                          <RiskBadge level={row.avg_risk >= 65 ? 'high' : row.avg_risk >= 35 ? 'moderate' : 'low'} score={row.avg_risk} />
                        </div>
                        <div className="mt-1 text-[9px] text-[#9a998e]">{row.high_risk} high-risk signals</div>
                      </div>
                    </button>
                  )
                })}
                {!speciesRows.length && <div className="col-span-full text-[12px] text-[#8a9187]">No species activity in this window.</div>}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle
                  title="Species distribution"
                  subtitle="30-day records by validated class"
                  action={<span className="font-mono text-[10px] text-[#92988f]">{totalSpeciesSignals} records</span>}
                />
                <div className="mt-3">
                  <SpeciesBars data={speciesRows} height={236} />
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle title="Diel activity" subtitle="Detection time-of-day, all species" />
                <div className="mt-3">
                  <HourBars data={analytics.data.hours} height={206} />
                </div>
                <div className="mt-2 text-[9.5px] leading-relaxed text-[#8b9188]">
                  Time-of-day patterns reflect camera scheduling and animal behaviour in the synthetic dataset. They
                  are not a behavioural study.
                </div>
              </div>
            </section>

            <section className="card p-5">
              <SectionTitle
                title="Detection history"
                subtitle="Filter by species and risk class; open the GIS layer for geospatial context"
                action={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSpecies('')
                        setRisk('')
                        setPage(1)
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        !species && !risk ? 'border-forest-500 bg-forest-50 text-forest-700' : 'border-[#e0dacb] bg-white text-[#7d867c]'
                      }`}
                    >
                      All
                    </button>
                    {['high', 'moderate', 'low'].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleRisk(level)}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${
                          risk === level ? 'border-transparent text-white' : 'border-[#e0dacb] bg-white text-[#7d867c]'
                        }`}
                        style={
                          risk === level
                            ? { background: level === 'high' ? '#B83B2B' : level === 'moderate' ? '#D9A441' : '#2F7250' }
                            : undefined
                        }
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                }
              />
              {species && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-[#8b9188]">Species filter:</span>
                  <SpeciesTag species={species} name={speciesRows.find((row) => row.key === species)?.name || titleCase(species)} />
                  <button type="button" className="text-[9.5px] text-forest-600 hover:underline" onClick={() => handleSpecies(species)}>
                    remove
                  </button>
                </div>
              )}
              <div className="mt-3">
                {detections.error ? (
                  <ErrorBox message={detections.error} onRetry={detections.reload} />
                ) : detections.loading && !detections.data ? (
                  <Loading height="h-64" />
                ) : (
                  <DetectionTable items={detections.data?.items || []} />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#ece7da] pt-3">
                <span className="text-[10px] text-[#8b9188]">
                  Page {detections.data?.pagination?.page || page} of {detections.data?.pagination?.pages || 1} ·{' '}
                  {detections.data?.pagination?.total || 0} records
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    <ChevronLeft className="h-3 w-3" /> Previous
                  </button>
                  <button
                    type="button"
                    className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                    disabled={page >= (detections.data?.pagination?.pages || 1)}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-[#e8e3d6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="eyebrow">Camera-sequence tracking</div>
                  <h2 className="mt-1 font-display text-[19px] text-ink">Inferred movement, not GPS telemetry</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="forest">{trackItems.length} tracks</Badge>
                  <Badge tone="warning">inferred only</Badge>
                </div>
              </div>
              <div className="grid gap-4 p-5 xl:grid-cols-12">
                <div className="xl:col-span-4">
                  {tracks.loading && !tracks.data ? (
                    <Loading height="h-72" />
                  ) : tracks.error ? (
                    <ErrorBox message={tracks.error} onRetry={tracks.reload} />
                  ) : (
                    <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                      {trackItems.map((track) => (
                        <TrackCard
                          key={track.id}
                          track={track}
                          selected={selectedTrack?.id === track.id}
                          onClick={() => setSelectedTrack(track)}
                        />
                      ))}
                      {!trackItems.length && (
                        <EmptyState
                          icon={Footprints}
                          title="No tracking evidence"
                          description="A track is created only when at least three detections of the same species link across multiple cameras within 24-hour gaps."
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="xl:col-span-8">
                  {trackMapData ? (
                    <MapView
                      data={trackMapData}
                      layers={{
                        forest: true,
                        villages: true,
                        riskZones: false,
                        alertCoverage: false,
                        cameras: false,
                        detections: false,
                        incidents: false,
                        guards: false,
                        tracks: true,
                      }}
                      height="390px"
                      selectedTrackId={selectedTrack?.id}
                      focus={trackFocus}
                      showLegend={false}
                    />
                  ) : (
                    <div className="flex h-[390px] items-center justify-center rounded-2xl border border-[#e4dfd1] bg-parchment text-[12px] text-[#8a9187]">
                      Loading track geometry…
                    </div>
                  )}
                  {selectedTrack && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {[
                        ['Species', selectedTrack.species_name],
                        ['Direction', directionLabel(selectedTrack.direction)],
                        ['Distance', `${selectedTrack.distance_km} km`],
                        ['Camera points', selectedTrack.point_count],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-[#e8e3d6] bg-[#f8f5ec] px-3 py-2">
                          <div className="text-[8.5px] uppercase tracking-[0.12em] text-[#9a998e]">{label}</div>
                          <div className="mt-0.5 text-[10.5px] font-semibold text-[#435046]">{value}</div>
                        </div>
                      ))}
                      <div className="sm:col-span-4 flex items-start gap-2 rounded-lg bg-[#f2eee2] px-3 py-2 text-[9.5px] leading-relaxed text-[#7d867c]">
                        <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {selectedTrack.disclaimer} Detection chain: {formatDateTime(selectedTrack.started_at)} →{' '}
                        {formatDateTime(selectedTrack.ended_at)} · mean confidence {confidencePercent(selectedTrack.confidence)}.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="card-dark relative overflow-hidden p-5">
              <img src="/images/forest.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-r from-forest-950 via-forest-950/90 to-forest-950/40" />
              <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-lime/80">
                    <ShieldAlert className="h-3 w-3" /> Method note
                  </div>
                  <h3 className="mt-2 font-display text-[21px] text-parchment">What a “track” means here</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-forest-100/65">
                    A track links sequential detections of the same species that are close in space and time. It
                    estimates a path and a direction relative to the nearest village boundary. It does not identify an
                    individual animal, and it is not GPS telemetry. Direction is withheld when a sequence is
                    ambiguous.
                  </p>
                </div>
                <div className="flex shrink-0 gap-5">
                  {[
                    ['3+', 'minimum points'],
                    ['24h', 'maximum gap'],
                    ['7 km', 'maximum step'],
                  ].map(([value, label]) => (
                    <div key={label} className="text-center">
                      <div className="font-display text-[24px] text-lime">{value}</div>
                      <div className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-forest-200/55">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )
      )}
    </div>
  )
}
