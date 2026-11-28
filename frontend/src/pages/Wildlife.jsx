import { useLanguage } from '../i18n'
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
  confidencePercent,
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
  const { t, number, dateTime, term } = useLanguage()
  const analytics = useApi('/api/analytics?days=30&operational=true')
  const catalog = useApi('/api/meta')
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
  const roster = (catalog.data?.supported_species || []).map(animal => ({
    ...animal, count: 0, ...speciesRows.find(row => row.key === animal.key),
  }))
  const thresholds = catalog.data?.risk?.thresholds
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
        eyebrow={t('Wildlife intelligence')}
        title={t('Animals, signals and inferred movement')}
        description={t('Detection history, activity by animal and camera-sequence tracking — with explicit confidence and method limitations.')}
        actions={
          <Badge tone="neutral">
            <Radar className="h-3 w-3" /> {t('30-day window')}
          </Badge>
        }
      />

      {analytics.error && <ErrorBox message={analytics.error} onRetry={analytics.reload} />}
      {analytics.loading && !analytics.data ? (
        <Loading label={t('Loading animal activity…')} height="h-64" />
      ) : (
        analytics.data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('Animal classes observed')}
                value={`${totals.species} / 6`}
                hint={t('Validated classes in the 30-day window')}
                icon={PawPrint}
                tone="forest"
              />
              <StatCard
                label={t('Detections')}
                value={number(totals.detections)}
                hint={`${totals.previous_detections} records exist before this window`}
                icon={Radar}
                tone="slate"
              />
              <StatCard
                label={t('High-risk signals')}
                value={totals.high_risk}
                hint={t('Explainable scores above the high threshold')}
                icon={TriangleAlert}
                tone="clay"
              />
              <StatCard
                label={t('Inferred tracks')}
                value={totals.tracked_sequences}
                hint={t('Sequential camera associations, not GPS')}
                icon={Route}
                tone="amber"
              />
            </section>

            <section>
              <SectionTitle
                title={t('Recognized animals')}
                subtitle={t('Recorded detections by animal')}
                action={<Badge tone="neutral">{t('click to filter history')}</Badge>}
                className="mb-3"
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {roster.map((row) => {
                  const active = species === row.key
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => handleSpecies(row.key)}
                      className={`group relative overflow-hidden rounded-xl border bg-parchment text-left transition ${active ? 'border-forest-500 shadow-[0_0_0_2px_rgba(47,114,80,0.12)]' : 'border-line-5 hover:border-success-line-5'
                        }`}
                    >
                      <div className="relative h-[104px] overflow-hidden bg-forest-900">
                        <img
                          src={speciesImage(row.key)}
                          alt={term('species', row.key, row.name)}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/85 via-forest-950/10 to-transparent" />
                        <div className="absolute bottom-2 left-2.5 right-2 flex items-end justify-between">
                          <span className="text-[10.5px] font-semibold leading-tight text-white">{term('species', row.key, row.name)}</span>
                          <span className="font-mono text-[14px] font-bold text-lime">{row.count}</span>
                        </div>
                        <span
                          className="absolute left-2 top-2 h-2 w-2 rounded-full ring-2 ring-white/50"
                          style={{ background: SPECIES_COLOR[row.key] }}
                        />
                      </div>
                      {row.count ? <div className="p-2.5">
                        <div className="flex items-center justify-between text-[9px] text-muted-11">
                          <span>{row.share}{t('% of records')}</span>
                          {thresholds && <RiskBadge level={row.avg_risk >= thresholds.high ? 'high' : row.avg_risk >= thresholds.moderate ? 'moderate' : 'low'} score={row.avg_risk} />}
                        </div>
                        <div className="mt-1 text-[9px] text-muted-16">{row.high_risk} {t('high-risk signals')}</div>
                      </div> : <div className="p-2.5 text-[10px] text-muted-8">{t('No detections in this period.')}</div>}
                    </button>
                  )
                })}
                {catalog.loading && !roster.length && <Loading label={t('Loading wildlife roster…')} height="h-24" />}
                {catalog.error && <ErrorBox message={catalog.error} onRetry={catalog.reload} />}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-12">
              <div className="card p-5 xl:col-span-7">
                <SectionTitle
                  title={t('Animal distribution')}
                  subtitle={t('30-day records by validated class')}
                  action={<span className="font-mono text-[10px] text-muted-13">{totalSpeciesSignals} {t('records')}</span>}
                />
                <div className="mt-3">
                  <SpeciesBars data={speciesRows} height={236} />
                </div>
              </div>
              <div className="card p-5 xl:col-span-5">
                <SectionTitle title={t('Diel activity')} subtitle={t('Detection time-of-day, all animals')} />
                <div className="mt-3">
                  <HourBars data={analytics.data.hours} height={206} />
                </div>
                <div className="mt-2 text-[9.5px] leading-relaxed text-muted-9">
                  {t('Temporal distribution of wildlife detections across morning, day, and nocturnal periods.')}
                </div>
              </div>
            </section>

            <section className="card p-5">
              <SectionTitle
                title={t('Detection history')}
                subtitle={t('Filter by animal and risk class; open the GIS layer for geospatial context')}
                action={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSpecies('')
                        setRisk('')
                        setPage(1)
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${!species && !risk ? 'border-forest-500 bg-success-surface-5 text-success-8' : 'border-control-line-8 bg-raised text-muted-5'
                        }`}
                    >
                      {t('All')}
                    </button>
                    {['high', 'moderate', 'low'].map((level) => (
                      <button
                        key={term('risk', level)}
                        type="button"
                        onClick={() => handleRisk(level)}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${risk === level ? `border-transparent ${level === 'moderate' ? 'text-forest-950' : 'text-white'}` : 'border-control-line-8 bg-raised text-muted-5'
                          }`}
                        style={
                          risk === level
                            ? { background: level === 'high' ? '#B83B2B' : level === 'moderate' ? '#D9A441' : '#2F7250' }
                            : undefined
                        }
                      >
                        {term('risk', level)}
                      </button>
                    ))}
                  </div>
                }
              />
              {species && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-9">{t('Animal filter')}</span>
                  <SpeciesTag species={species} name={speciesRows.find((row) => row.key === species)?.name || titleCase(species)} />
                  <button type="button" className="text-[9.5px] text-success-7 hover:underline" onClick={() => handleSpecies(species)}>
                    {t('remove')}
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
              <div className="mt-3 flex items-center justify-between border-t border-line-13 pt-3">
                <span className="text-[10px] text-muted-9">
                  {t('Page')} {detections.data?.pagination?.page || page} {t('of')} {detections.data?.pagination?.pages || 1} ·{' '}
                  {detections.data?.pagination?.total || 0} {t('records')}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    <ChevronLeft className="h-3 w-3" /> {t('Previous')}
                  </button>
                  <button
                    type="button"
                    className="btn-outline !px-2.5 !py-1.5 !text-[10px]"
                    disabled={page >= (detections.data?.pagination?.pages || 1)}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t('Next')} <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-line-10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="eyebrow">{t('Camera-sequence tracking')}</div>
                  <h2 className="mt-1 font-display text-[19px] text-ink">{t('Inferred movement, not GPS telemetry')}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="forest">{trackItems.length} {t('tracks')}</Badge>
                  <Badge tone="warning">{t('inferred only')}</Badge>
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
                          title={t('No tracking evidence')}
                          description={t('A track is created only when at least three detections of the same animal class link across multiple cameras within 24-hour gaps.')}
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
                    <div className="flex h-[390px] items-center justify-center rounded-2xl border border-line-7 bg-parchment text-[12px] text-muted-8">
                      {t('Loading track geometry…')}
                    </div>
                  )}
                  {selectedTrack && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {[
                        [t('Animal'), term('species', selectedTrack.species, selectedTrack.species_name)],
                        [t('Direction'), term('direction', selectedTrack.direction)],
                        [t('Distance'), t('{distance} km', { distance: selectedTrack.distance_km })],
                        [t('Camera points'), selectedTrack.point_count],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-line-10 bg-inset-14 px-3 py-2">
                          <div className="text-[8.5px] uppercase tracking-[0.12em] text-muted-16">{t(label)}</div>
                          <div className="mt-0.5 text-[10.5px] font-semibold text-secondary-3">{value}</div>
                        </div>
                      ))}
                      <div className="sm:col-span-4 flex items-start gap-2 rounded-lg bg-inset-1 px-3 py-2 text-[9.5px] leading-relaxed text-muted-5">
                        <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {t('Detection chain:')} {dateTime(selectedTrack.started_at)} →{' '}
                        {dateTime(selectedTrack.ended_at)} {t('· mean confidence')} {confidencePercent(selectedTrack.confidence)}.
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
                    <ShieldAlert className="h-3 w-3" /> {t('Method note')}
                  </div>
                  <h3 className="mt-2 font-display text-[21px] text-brand-light">{t('What a “track” means here')}</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-forest-100/65">
                    {t('A track links sequential detections of the same animal class that are close in space and time. It estimates a path and a direction relative to the nearest village boundary. It does not identify an individual animal, and it is not GPS telemetry. Direction is withheld when a sequence is ambiguous.')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-5">
                  {[
                    ['3+', t('minimum points')],
                    ['24h', t('maximum gap')],
                    ['7 km', t('maximum step')],
                  ].map(([value, label]) => (
                    <div key={label} className="text-center">
                      <div className="font-display text-[24px] text-lime">{value}</div>
                      <div className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-muted-21/55">{t(label)}</div>
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
