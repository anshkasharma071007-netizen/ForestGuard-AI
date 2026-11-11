import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Map as MapIcon,
  MapPin,
  PawPrint,
  Radar,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import MapView from '../components/MapView'
import { ActivityArea, RiskDonut } from '../components/charts'
import { AlertRow, CameraStatusCard, DetectionTable } from '../components/cards'
import {
  Badge,
  DemoNotice,
  ErrorBox,
  Loading,
  PageHeader,
  RiskBadge,
  SectionTitle,
  StatCard,
  StatusBadge,
} from '../components/ui'
import { compactNumber, formatDate, timeAgo, titleCase } from '../utils/format'

export default function Overview() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi('/api/overview')
  const map = useApi('/api/map/layers?days=30')

  const totals = data?.totals
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${greeting} · ${formatDate(now)}`}
        title="Range intelligence, at a glance"
        description="A consolidated picture of wildlife activity, explainable risk and field response across the demonstration landscape."
        actions={
          <>
            <Link to="/monitoring" className="btn-outline">
              <Radar className="h-4 w-4" /> New analysis
            </Link>
            <Link to="/map" className="btn-primary">
              <MapIcon className="h-4 w-4" /> Open GIS map
            </Link>
          </>
        }
      />

      <DemoNotice compact />

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading label="Assembling range intelligence…" height="h-72" />}

      {data && (
        <>
          <section className="card-dark relative overflow-hidden">
            <img
              src="/images/tiger.webp"
              alt=""
              className="hero-mask absolute inset-y-0 right-0 h-full w-[58%] object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-forest-950 via-forest-950/90 to-forest-950/10" />
            <div className="grain absolute inset-0" />
            <div className="relative z-10 flex flex-col gap-7 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-lg">
                <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-lime">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                  {greeting}, {user?.name?.split(' ').slice(-1)[0] || 'officer'}
                </div>
                <h2 className="mt-3 font-display text-[31px] leading-[1.08] tracking-[-0.02em] text-parchment sm:text-[36px]">
                  Every signal, mapped before it becomes a conflict.
                </h2>
                <p className="mt-3 text-[12.5px] leading-relaxed text-forest-100/65">
                  Detections become geolocated risk signals. Risk signals become village advisories and
                  guard tasks — with a clear separation between proximity-based concern and confirmed
                  camera-sequence movement.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to="/map" className="btn-lime !py-2">
                    Explore risk map <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    to="/risk"
                    className="btn border border-white/15 bg-white/[0.06] text-forest-100 hover:bg-white/10 !py-2"
                  >
                    Review active alerts
                  </Link>
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-3 gap-5 rounded-xl border border-white/10 bg-forest-950/40 px-5 py-4 backdrop-blur-sm">
                {[
                  ['24h signals', compactNumber(totals.detections_24h)],
                  ['Active advisories', totals.active_alerts],
                  ['Villages covered', totals.villages_monitored],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="font-display text-[25px] leading-none text-parchment">{value}</div>
                    <div className="mt-1.5 text-[8.5px] uppercase tracking-[0.14em] text-forest-200/60">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Wildlife detections"
              value={compactNumber(totals.detections)}
              hint={`${totals.detections_24h} in the last 24 hours · all-time records`}
              icon={PawPrint}
              tone="forest"
            />
            <StatCard
              label="Active alerts"
              value={totals.active_alerts}
              hint="Open advisories requiring acknowledgement or closure"
              icon={ShieldAlert}
              tone="clay"
            />
            <StatCard
              label="High-risk signals"
              value={totals.high_risk_24h}
              hint="Detections classified high risk in the last 24 hours"
              icon={TriangleAlert}
              tone="amber"
            />
            <StatCard
              label="Species detected"
              value={`${totals.species_detected} / 6`}
              hint={`${totals.cameras_online} of ${totals.cameras_total} camera stations reporting`}
              icon={Radar}
              tone="slate"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <div className="card p-5 xl:col-span-8">
              <SectionTitle
                title="Detection activity"
                subtitle="Daily detections over the last 30 days"
                action={
                  <div className="flex items-center gap-2">
                    <Badge tone="forest" dot>
                      All species
                    </Badge>
                    <span className="text-[10px] text-[#92988f]">DEMO</span>
                  </div>
                }
              />
              <div className="mt-3">
                <ActivityArea data={data.activity} height={214} />
              </div>
            </div>
            <div className="card p-5 xl:col-span-4">
              <SectionTitle title="Risk composition" subtitle="30-day detection classification" />
              <div className="mt-2">
                <RiskDonut data={data.risk_distribution} height={188} />
              </div>
              <div className="mt-3 rounded-lg border border-[#ece7da] bg-[#f7f4ea] px-2.5 py-2 text-[9.5px] leading-relaxed text-[#7d867c]">
                Proximity risk is kept distinct from movement-supported risk. A nearby animal is not
                assumed to be approaching a village.
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <div className="card p-5 xl:col-span-8">
              <SectionTitle
                title="Recent detections"
                subtitle="Latest AI-assisted observations across the landscape"
                action={
                  <Link to="/wildlife" className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-600 hover:underline">
                    All detections <ChevronRight className="h-3 w-3" />
                  </Link>
                }
              />
              <div className="mt-3">
                <DetectionTable
                  items={data.recent_detections}
                  compact
                  onSelect={(detection) => navigate(`/map?detection=${detection.id}`)}
                />
              </div>
            </div>
            <div className="card flex flex-col p-5 xl:col-span-4">
              <SectionTitle
                title="Priority alerts"
                subtitle="Open advisories ranked by severity"
                action={
                  <Link to="/risk" className="text-[11px] font-semibold text-forest-600 hover:underline">
                    Manage
                  </Link>
                }
              />
              <div className="mt-3 space-y-2">
                {data.active_alerts.length ? (
                  data.active_alerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} dense onClick={() => navigate('/risk')} />
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#ddd7c8] px-4 py-8 text-center text-[12px] text-[#8a9187]">
                    No active advisories. All alerts have been resolved.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-[#e8e3d6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="eyebrow">Geospatial preview</div>
                <h2 className="mt-1 font-display text-[19px] text-ink">Wildlife signals and indicative risk zones</h2>
              </div>
              <Link to="/map" className="btn-outline !py-2">
                Full GIS intelligence <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {map.data ? (
              <MapView
                data={map.data}
                height="360px"
                showLegend={false}
                layers={{ guards: false, tracks: true, alertCoverage: false }}
                onSelectDetection={(detection) => navigate(`/map?detection=${detection.id}`)}
                className="rounded-none border-0"
              />
            ) : (
              <div className="flex h-[360px] items-center justify-center text-[12px] text-[#8a9187]">
                Loading geospatial preview…
              </div>
            )}
            <div className="flex items-center justify-between border-t border-[#e8e3d6] px-5 py-2.5 text-[9.5px] text-[#949a91]">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Illustrative boundaries · indicative risk grid
              </span>
              <span>{map.data?.risk_zones?.features?.length || 0} risk cells · {map.data?.detections?.length || 0} signals shown</span>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <div className="card p-5 xl:col-span-7">
              <SectionTitle
                title="Camera station registry"
                subtitle="Demonstration positions — no live government feeds"
                action={
                  <Link to="/monitoring" className="text-[11px] font-semibold text-forest-600 hover:underline">
                    Monitoring
                  </Link>
                }
              />
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {data.cameras.slice(0, 6).map((camera) => (
                  <CameraStatusCard key={camera.id} camera={camera} lastDetection={camera.last_seen} />
                ))}
              </div>
            </div>
            <div className="card p-5 xl:col-span-5">
              <SectionTitle title="Field incidents" subtitle="Open and verified reports" action={<Badge tone="warning">{data.incidents.length} open</Badge>} />
              <div className="mt-3 space-y-2">
                {data.incidents.length ? (
                  data.incidents.map((incident) => (
                    <div key={incident.id} className="flex items-start gap-3 rounded-xl border border-[#e9e4d7] bg-white/60 p-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f7e8e2] text-clay">
                        <TriangleAlert className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11.5px] font-semibold text-ink">{titleCase(incident.category)}</span>
                          <RiskBadge level={incident.severity === 'high' ? 'high' : incident.severity === 'moderate' ? 'moderate' : 'low'} />
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-[#7d867c]">
                          {incident.description}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[9px] text-[#92988f]">
                          <span>{incident.village_name || 'Buffer area'}</span>
                          <span>·</span>
                          <span>{timeAgo(incident.created_at)}</span>
                          <StatusBadge status={incident.status} />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[#ddd7c8] px-4 py-8 text-center text-[12px] text-[#8a9187]">
                    No open incidents.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <div className="card p-5 xl:col-span-7">
              <SectionTitle title="Village exposure" subtitle="Recent signal strength near each boundary" />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.villages.map((village) => (
                  <div key={village.id} className="rounded-xl border border-[#e9e4d7] bg-white/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-forest-500" />
                        <span className="text-[12px] font-semibold text-ink">{village.name}</span>
                      </div>
                      <RiskBadge level={village.risk_level} />
                    </div>
                    <div className="mt-1.5 text-[10px] text-[#8b9188]">
                      {village.population?.toLocaleString('en-IN')} residents · {village.households} households
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-dark relative overflow-hidden p-5 xl:col-span-5">
              <img src="/images/forest.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/80 to-forest-950/40" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-lime/80">
                    <Sparkles className="h-3 w-3" /> How the workflow runs
                  </div>
                  <h3 className="mt-2 font-display text-[21px] leading-snug text-parchment">
                    Detection → risk → advisory → response
                  </h3>
                  <div className="mt-4 space-y-2">
                    {[
                      'AI localises an animal and classifies species with CLIP.',
                      'Geolocation and explainable scoring produce a risk level.',
                      'Nearby villages are identified within a configurable alert radius.',
                      'Guards receive a prioritised task and track the response.',
                    ].map((step, index) => (
                      <div key={step} className="flex items-start gap-2.5 text-[11px] leading-relaxed text-forest-100/70">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-lime/15 font-mono text-[8px] font-bold text-lime">
                          {index + 1}
                        </span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-forest-200/45">
                  <Camera className="h-3 w-3" /> Camera observations · not GPS tracking
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
