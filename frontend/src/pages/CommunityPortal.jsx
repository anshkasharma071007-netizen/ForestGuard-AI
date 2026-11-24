import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  EyeOff,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ThemeToggle from '../components/ThemeToggle'
import { useApi } from '../hooks/useApi'
import { Badge, ErrorBox, Loading, Logo, SectionTitle, StatusBadge } from '../components/ui'
import { formatDateTime, timeAgo, titleCase } from '../utils/format'

const NAV = [
  ['advisories', 'Advisories'],
  ['report', 'Report a sighting'],
  ['status', 'Check status'],
  ['safety', 'Safety guidance'],
]

const EMPTY_FORM = {
  category: 'sighting',
  species: 'unidentified',
  village_code: '',
  reporter_name: '',
  contact: '',
  description: '',
}

export default function CommunityPortal() {
  const summary = useApi('/api/community/summary')
  const advisories = useApi('/api/community/alerts?days=21&limit=20')
  const guidelines = useApi('/api/community/guidelines')
  const villages = useApi('/api/community/villages')

  const [severity, setSeverity] = useState('all')
  const [form, setForm] = useState(EMPTY_FORM)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [copied, setCopied] = useState(false)

  const [reference, setReference] = useState('')
  const [checking, setChecking] = useState(false)
  const [statusError, setStatusError] = useState(null)
  const [statusResult, setStatusResult] = useState(null)

  const [activeSpecies, setActiveSpecies] = useState(null)

  const advisoryItems = advisories.data?.items || []
  const filteredAdvisories = advisoryItems.filter((item) => severity === 'all' || item.severity === severity)
  const speciesList = guidelines.data?.species || []
  const active = speciesList.find((item) => item.key === activeSpecies) || speciesList[0]
  const helplines = summary.data?.helplines

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const pickPhoto = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }

  const clearPhoto = () => {
    setPhoto(null)
    setPhotoPreview(null)
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    clearPhoto()
  }

  const submitReport = async (event) => {
    event.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      const body = new FormData()
      body.append('category', form.category)
      body.append('species', form.species)
      body.append('description', form.description.trim())
      body.append('reporter_name', form.reporter_name.trim())
      if (form.contact.trim()) body.append('contact', form.contact.trim())
      if (form.village_code) body.append('village_code', form.village_code)
      if (photo) body.append('image', photo)
      const response = await api.post('/api/community/reports', body)
      setReceipt(response.data)
      setReference(response.data.reference_code)
      resetForm()
      summary.reload()
      document.getElementById('status')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
      setSubmitError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const checkStatus = async (event) => {
    event.preventDefault()
    if (!reference.trim()) return
    setChecking(true)
    setStatusError(null)
    setStatusResult(null)
    try {
      const response = await api.get(`/api/community/reports/${encodeURIComponent(reference.trim())}`)
      setStatusResult(response.data)
    } catch (err) {
      setStatusError(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  const copyReference = async () => {
    if (!receipt?.reference_code) return
    try {
      await navigator.clipboard.writeText(receipt.reference_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="min-h-screen bg-sand">
      <header className="sticky top-0 z-40 border-b border-line-5/80 bg-parchment/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/community" aria-label="Forest Guard AI community portal">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-5 lg:flex">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-[11.5px] font-medium text-secondary-8 transition hover:text-success-8">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            <span className="hidden rounded-full border border-control-line-4 bg-inset-10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-warning-4 xl:block">
              Public portal
            </span>
            <Link to="/login" className="btn-outline !px-3 !py-2 !text-[11px]">
              Staff sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:py-12">
        <section className="card-dark relative overflow-hidden">
          <img src="/images/tiger.webp" alt="" className="absolute inset-y-0 right-0 h-full w-[60%] object-cover opacity-55" />
          <div className="absolute inset-0 bg-gradient-to-r from-forest-950 via-forest-950/92 to-forest-950/20" />
          <div className="grain absolute inset-0" />
          <div className="relative z-10 grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.22em] text-lime">
                <span className="h-1.5 w-1.5 rounded-full bg-lime" /> Village safety · buffer landscape
              </div>
              <h1 className="mt-3 font-display text-[34px] leading-[1.06] tracking-[-0.02em] text-brand-light sm:text-[44px]">
                Stay informed. Stay safe. Coexist with wildlife.
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-forest-100/70">
                Public safety advisories, a direct line to report a sighting or conflict, and practical guidance for
                households near the forest boundary. Exact camera and animal locations are never published here.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <a href="#advisories" className="btn-lime !py-2.5">
                  View advisories <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <a href="#report" className="btn border border-white/15 bg-white/[0.06] text-forest-100 hover:bg-white/10 !py-2.5">
                  Report a sighting
                </a>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 rounded-xl border border-white/10 bg-forest-950/45 px-5 py-4 backdrop-blur-sm">
              {[
                ['Active advisories', summary.data?.active_advisories ?? '—'],
                ['High priority', summary.data?.high_priority_advisories ?? '—'],
                ['Villages covered', summary.data?.villages_covered ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-display text-[26px] leading-none text-brand-light">{value}</div>
                  <div className="mt-1.5 text-[8.5px] uppercase tracking-[0.12em] text-forest-200/60">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="advisories" className="scroll-mt-24">
          <SectionTitle
            title="Public safety advisories"
            subtitle="Coarse area guidance only — no camera, patrol or exact wildlife coordinates are ever shown"
            action={
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  ['all', 'All'],
                  ['high', 'High'],
                  ['moderate', 'Moderate'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSeverity(value)}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
                      severity === value
                        ? 'border-forest-600 bg-success-surface-5 text-success-8'
                        : 'border-control-line-8 bg-raised text-muted-5 hover:border-success-line-5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
            className="mb-3"
          />

          {advisories.loading && !advisories.data ? (
            <Loading label="Loading public advisories…" height="h-48" />
          ) : advisories.error ? (
            <ErrorBox message={advisories.error} onRetry={advisories.reload} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredAdvisories.map((advisory) => (
                <article key={advisory.id} className="card overflow-hidden p-0">
                  <div className="flex items-start gap-3 p-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: advisory.color || '#B83B2B' }}
                    >
                      <Siren className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-ink">{advisory.species_name}</span>
                        <Badge tone={advisory.severity === 'high' ? 'danger' : 'warning'}>
                          {advisory.severity} priority
                        </Badge>
                        <StatusBadge status={advisory.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-13">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5" /> {advisory.area_label}
                        </span>
                        <span>·</span>
                        <span>{advisory.village_names?.join(', ') || 'Buffer villages'}</span>
                        <span>·</span>
                        <span>{timeAgo(advisory.created_at)}</span>
                      </div>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-secondary-8">{advisory.summary}</p>
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-inset-10 px-2.5 py-2 text-[10px] leading-relaxed text-warning-2">
                        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                        {advisory.advice}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-line-13 bg-inset-16 px-4 py-2 text-[9px] text-muted-13">
                    <span>Precise locations withheld</span>
                    <span>{advisory.is_simulated ? 'Synthetic advisory' : 'Field advisory'}</span>
                  </div>
                </article>
              ))}
              {!filteredAdvisories.length && (
                <div className="col-span-full rounded-2xl border border-dashed border-control-line-1 bg-parchment/60 px-6 py-12 text-center">
                  <ShieldCheck className="mx-auto h-6 w-6 text-success-5" />
                  <div className="mt-2 font-display text-[17px] text-ink">No advisories in this filter</div>
                  <p className="mt-1 text-[11.5px] text-muted-3">
                    There are no open {severity === 'all' ? '' : severity} advisories within the 21-day window.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-line-7 bg-inset-14 px-3.5 py-2.5 text-[10px] leading-relaxed text-muted-5">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Advisories describe a coarse buffer area and the villages likely to be affected. They deliberately omit
            camera positions, detection coordinates, patrol routes and individual animal identities.
          </div>
        </section>

        <section id="report" className="scroll-mt-24 grid gap-4 lg:grid-cols-12">
          <div className="card p-5 lg:col-span-7">
            <SectionTitle
              title="Report a sighting or conflict"
              subtitle="Your report reaches the range office for review"
              action={<Badge tone="forest">public form</Badge>}
            />
            {receipt ? (
              <div className="mt-4 rounded-2xl border border-success-line-1 bg-success-surface-3 p-5">
                <div className="flex items-center gap-2 text-success-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-[13px] font-semibold">Report received</span>
                </div>
                <div className="mt-2 text-[11.5px] leading-relaxed text-success-2">{receipt.message}</div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="rounded-lg border border-success-line-1 bg-raised px-3 py-2">
                    <div className="text-[8px] uppercase tracking-[0.14em] text-muted-3">Reference code</div>
                    <div className="mt-0.5 font-mono text-[16px] font-bold text-success-1">{receipt.reference_code}</div>
                  </div>
                  <button type="button" className="btn-outline !py-2" onClick={copyReference}>
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                </div>
                <div className="mt-2 text-[9.5px] text-success-4">{receipt.contact_note}</div>
                <button
                  type="button"
                  className="mt-3 text-[10.5px] font-semibold text-success-8 hover:underline"
                  onClick={() => setReceipt(null)}
                >
                  Submit another report
                </button>
              </div>
            ) : (
              <form className="mt-4 space-y-3" onSubmit={submitReport}>
                <div>
                  <div className="field-label">What are you reporting?</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['sighting', 'Wildlife sighting', 'An animal seen near homes or fields.'],
                      ['conflict', 'Conflict incident', 'Injury, livestock loss or property damage.'],
                    ].map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => update('category', value)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${
                          form.category === value
                            ? 'border-forest-500 bg-success-surface-5'
                            : 'border-control-line-8 bg-raised/70 hover:border-success-line-5'
                        }`}
                      >
                        <div className="text-[11.5px] font-semibold text-ink">{label}</div>
                        <div className="mt-0.5 text-[9px] leading-snug text-muted-9">{hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="report-species">
                      Species (best estimate)
                    </label>
                    <select
                      id="report-species"
                      className="field"
                      value={form.species}
                      onChange={(event) => update('species', event.target.value)}
                    >
                      {speciesList.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.name}
                        </option>
                      ))}
                      <option value="unidentified">Not sure / unidentified</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="report-village">
                      Nearest village (optional)
                    </label>
                    <select
                      id="report-village"
                      className="field"
                      value={form.village_code}
                      onChange={(event) => update('village_code', event.target.value)}
                    >
                      <option value="">Prefer not to say</option>
                      {villages.data?.items?.map((village) => (
                        <option key={village.code} value={village.code}>
                          {village.name} · {village.district}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="report-description">
                    What did you observe?
                  </label>
                  <textarea
                    id="report-description"
                    className="field min-h-[96px] resize-y"
                    required
                    minLength={12}
                    maxLength={4000}
                    value={form.description}
                    onChange={(event) => update('description', event.target.value)}
                    placeholder="Describe the animal, its behaviour, the time, and an approximate landmark. Do not approach wildlife to confirm details."
                  />
                  <div className="mt-1 flex items-center justify-between text-[9px] text-muted-16">
                    <span>Approximate landmarks are enough. Never enter the forest to verify.</span>
                    <span className="font-mono">{form.description.length} / 4000</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="report-name">
                      Your name
                    </label>
                    <input
                      id="report-name"
                      className="field"
                      required
                      maxLength={120}
                      value={form.reporter_name}
                      onChange={(event) => update('reporter_name', event.target.value)}
                      placeholder="Name used by the range office to follow up"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="report-contact">
                      Phone or email (optional)
                    </label>
                    <input
                      id="report-contact"
                      className="field"
                      maxLength={80}
                      value={form.contact}
                      onChange={(event) => update('contact', event.target.value)}
                      placeholder="Only shared with forest staff"
                    />
                  </div>
                </div>

                <div>
                  <div className="field-label">Photograph (optional)</div>
                  {photo ? (
                    <div className="flex items-center gap-3 rounded-xl border border-control-line-8 bg-raised/70 p-2.5">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Report preview" className="h-14 w-20 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-inset-1">
                          <Camera className="h-5 w-5 text-muted-16" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium text-ink">{photo.name}</div>
                        <div className="text-[9px] text-muted-9">{Math.round(photo.size / 1024)} KB</div>
                      </div>
                      <button type="button" className="rounded-lg p-1.5 text-muted-9 hover:bg-inset-1" onClick={clearPhoto} aria-label="Remove photo">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-control-line-1 bg-inset-15 px-3 py-3 text-[10.5px] text-muted-5 transition hover:border-success-line-4">
                      <ImagePlus className="h-4 w-4 text-success-5" />
                      Attach a JPEG, PNG or WebP image
                      <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                    </label>
                  )}
                </div>

                {submitError && (
                  <div className="rounded-lg border border-danger-line-1 bg-danger-surface-3 px-3 py-2 text-[10.5px] text-danger-2">
                    {submitError}
                  </div>
                )}

                <button type="submit" className="btn-primary w-full !py-2.5" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  {submitting ? 'Submitting report…' : 'Submit report to range office'}
                </button>
                <p className="text-[9px] leading-relaxed text-muted-16">
                  For immediate danger to life call 112. Reports are queued for review; they do not trigger an
                  automated emergency response.
                </p>
              </form>
            )}
          </div>

          <div className="space-y-4 lg:col-span-5">
            <div id="status" className="card scroll-mt-24 p-5">
              <SectionTitle
                title="Check a report"
                subtitle="Use the reference code from your submission"
                action={<Search className="h-4 w-4 text-muted-16" />}
              />
              <form className="mt-3 flex gap-2" onSubmit={checkStatus}>
                <input
                  className="field font-mono uppercase"
                  placeholder="FG-2026-0000"
                  value={reference}
                  onChange={(event) => setReference(event.target.value.toUpperCase())}
                  aria-label="Report reference code"
                />
                <button type="submit" className="btn-outline shrink-0 !py-2" disabled={checking || !reference.trim()}>
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Check
                </button>
              </form>
              {statusError && (
                <div className="mt-2 rounded-lg border border-danger-line-1 bg-danger-surface-3 px-3 py-2 text-[10.5px] text-danger-2">
                  {statusError}
                </div>
              )}
              {statusResult && (
                <div className="mt-3 rounded-xl border border-line-10 bg-inset-14 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-ink">{statusResult.reference_code}</span>
                    <StatusBadge status={statusResult.status} />
                    <Badge tone="neutral">{titleCase(statusResult.category)}</Badge>
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-ink">{statusResult.species_name}</div>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-secondary-15">{statusResult.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-muted-13">
                    <span>{statusResult.village_name || 'Village not specified'}</span>
                    <span>·</span>
                    <span>{formatDateTime(statusResult.created_at)}</span>
                  </div>
                  <div className="mt-2 rounded-lg bg-raised/70 px-2.5 py-1.5 text-[9.5px] leading-relaxed text-secondary-8">
                    {statusResult.status_note}
                  </div>
                </div>
              )}
              <div className="mt-3 rounded-lg bg-inset-1 px-2.5 py-2 text-[9px] leading-relaxed text-muted-5">
                Status updates are made by forest staff after review. Keep your reference code private.
              </div>
            </div>

            <div className="card p-5">
              <SectionTitle title="Emergency & helplines" subtitle="Use these first if there is immediate risk" />
              <div className="mt-3 space-y-2">
                {[
                  ['National emergency', '112', Phone],
                  ['Forest helpline', helplines?.forest_control_room || '1926', Siren],
                  ['Wildlife assistance', helplines?.wildlife_emergency || 'Contact your range office', ShieldCheck],
                ].map(([label, value, Icon]) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-line-11 bg-raised/60 px-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-surface-2 text-danger-5">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-muted-16">{label}</div>
                      <div className="mt-0.5 text-[11.5px] font-semibold text-ink">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] leading-relaxed text-muted-16">
                Always follow instructions from local authorities and the forest department.
              </p>
            </div>

            <div className="card p-5">
              <SectionTitle title="What this portal never shows" subtitle="Privacy-preserving public design" />
              <ul className="mt-3 space-y-2">
                {[
                  'Camera-trap coordinates or live surveillance feeds',
                  'Exact detection locations or individual animal identities',
                  'Guard names, patrol routes or response positions',
                  'Restricted forest-department operational data',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[10.5px] leading-relaxed text-secondary-8">
                    <EyeOff className="mt-0.5 h-3 w-3 shrink-0 text-success-5" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="safety" className="scroll-mt-24">
          <SectionTitle
            title="Safety guidance"
            subtitle="General household advice and species-specific notes for the buffer landscape"
            className="mb-3"
          />
          {guidelines.loading && !guidelines.data ? (
            <Loading label="Loading safety guidance…" height="h-48" />
          ) : guidelines.error ? (
            <ErrorBox message={guidelines.error} onRetry={guidelines.reload} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="card p-5 lg:col-span-5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-16">General guidance</div>
                <ol className="mt-3 space-y-2.5">
                  {(guidelines.data?.general || []).map((item, index) => (
                    <li key={item} className="flex items-start gap-2.5 text-[10.5px] leading-relaxed text-secondary-8">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest-900 font-mono text-[8px] font-bold text-lime">
                        {index + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ol>
                <div className="mt-4 rounded-xl border border-danger-line-2 bg-danger-surface-4 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-danger-2">
                    <TriangleAlert className="h-3.5 w-3.5" /> If someone is injured
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {(guidelines.data?.emergency || []).map((item) => (
                      <li key={item} className="text-[9.5px] leading-relaxed text-danger-4">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card p-5 lg:col-span-7">
                <div className="flex flex-wrap gap-1.5">
                  {speciesList.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveSpecies(item.key)}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                        active?.key === item.key
                          ? 'border-forest-500 bg-success-surface-5 text-success-8'
                          : 'border-control-line-8 bg-raised text-muted-5 hover:border-success-line-5'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                      {item.name}
                    </button>
                  ))}
                </div>
                {active && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-line-10">
                    <div className="relative h-36 bg-forest-900">
                      <img src={active.image} alt={active.name} className="h-full w-full object-cover opacity-90" />
                      <div className="absolute inset-0 bg-gradient-to-t from-forest-950/85 to-transparent" />
                      <div className="absolute bottom-2.5 left-3 right-3">
                        <div className="font-display text-[19px] leading-tight text-brand-light">{active.name}</div>
                        <div className="text-[9px] italic text-forest-100/60">{active.scientific}</div>
                      </div>
                    </div>
                    <div className="bg-raised/70 p-3.5">
                      <p className="text-[10.5px] leading-relaxed text-secondary-8">{active.description}</p>
                      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-inset-10 px-2.5 py-2 text-[10px] leading-relaxed text-warning-2">
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {active.advice}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-13">
                        <Users className="h-3 w-3" /> Share this guidance within your household and village committee.
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-muted-16">
                  <span className="flex items-center gap-1.5">
                    <BellRing className="h-3 w-3" /> Advisories update as new alerts are verified.
                  </span>
                  <a href="#advisories" className="inline-flex items-center gap-1 font-semibold text-success-8 hover:underline">
                    Back to advisories <ChevronDown className="h-3 w-3 rotate-180" />
                  </a>
                </div>
              </div>
            </div>
          )}
          <p className="mt-3 text-[9px] leading-relaxed text-muted-16">{guidelines.data?.source_note}</p>
        </section>

        <section className="card-dark relative overflow-hidden p-6 sm:p-8">
          <img src="/images/forest.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-r from-forest-950 via-forest-950/90 to-forest-950/50" />
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-lime/80">
                <ShieldCheck className="h-3 w-3" /> Working together
              </div>
              <h2 className="mt-2 font-display text-[24px] leading-snug text-brand-light">
                Early reports protect people and wildlife.
              </h2>
              <p className="mt-2 text-[11.5px] leading-relaxed text-forest-100/65">
                Report sightings promptly and from a safe distance. Do not chase, surround or feed animals, and never
                enter restricted forest areas to verify a sighting.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="#report" className="btn-lime !py-2.5">
                Report a sighting <ArrowRight className="h-3.5 w-3.5" />
              </a>
              <a href="#safety" className="btn border border-white/15 bg-white/[0.06] text-forest-100 hover:bg-white/10 !py-2.5">
                Safety guidance
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-5 bg-inset-11">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[10px] text-muted-12 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <LanguageSwitcher className="mb-2 inline-flex sm:hidden" />
            <div className="font-semibold text-secondary-8">Forest Guard AI · Community portal</div>
            <div className="mt-0.5">Protecting Forests. Preventing Conflict. Saving Lives.</div>
          </div>
          <div className="text-left sm:text-right">
            <div>VanDrishti · Forest Department & Community Coexistence</div>
            <div className="mt-0.5">For wildlife emergencies, contact your local forest range office or call 112.</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
