import { useLanguage } from '../i18n'
import EvidenceImage from '../components/EvidenceImage'
import { useRef, useState } from 'react'
import {
  Aperture,
  CheckCircle2,
  Cpu,
  FileImage,
  ImagePlus,
  Loader2,
  Play,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Video,
  X,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { DetectionTable, CameraStatusCard } from '../components/cards'
import {
  Badge,
  ErrorBox,
  Loading,
  PageHeader,
  SectionTitle,
  SpeciesTag,
  StatCard,
} from '../components/ui'
import { confidencePercent, speciesImage } from '../utils/format'

const STAGES = [
  'Uploading media…',
  'Localising animals with YOLO-World…',
  'Identifying animals with CLIP…',
  'Scoring risk and storing records…',
]

export default function LiveMonitoring() {
  const { t, dateTime, term } = useLanguage()
  const cameras = useApi('/api/cameras')
  const ai = useApi('/api/ai/status')
  const recent = useApi('/api/detections?page_size=8')
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [cameraCode, setCameraCode] = useState('')
  const [notes, setNotes] = useState('')
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [stage, setStage] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const selectFile = (next) => {
    if (!next) return
    setError(null)
    setResult(null)
    setFile(next)
    if (next.type.startsWith('image/')) {
      const url = URL.createObjectURL(next)
      setPreview(url)
    } else {
      setPreview(null)
    }
    if (!cameraCode && cameras.data?.items?.length) {
      setCameraCode(cameras.data.items[0].code)
    }
  }

  const onDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    selectFile(event.dataTransfer.files?.[0])
  }

  const clearFile = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const analyze = async () => {
    if (!file) {
      setError('Choose an image or video first.')
      return
    }
    setAnalyzing(true)
    setError(null)
    setResult(null)
    setStage(0)
    const timers = [
      setTimeout(() => setStage(1), 900),
      setTimeout(() => setStage(2), 4200),
      setTimeout(() => setStage(3), 9500),
    ]
    try {
      const form = new FormData()
      form.append('file', file)
      if (cameraCode) form.append('camera_code', cameraCode)
      if (notes) form.append('notes', notes)
      const response = await api.post('/api/detections/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      })
      setResult(response.data)
      recent.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      timers.forEach(clearTimeout)
      setAnalyzing(false)
      setStage(0)
    }
  }

  const engine = ai.data
  const engineReady = engine?.loaded
  const uploaded = result?.stored || []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('Field inputs · AI inference')}
        title={t('From camera frame to risk signal')}
        description={t('Upload a camera-trap image or short video for real two-stage inference: open-vocabulary localisation followed by zero-shot animal classification.')}
        actions={
          <Badge tone={engineReady ? 'forest' : engine ? 'warning' : 'neutral'} dot>
            {engineReady ? t('AI engine ready · {device}', { device: engine.device }) : engine ? t(engine.mode) : t('Checking engine')}
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card p-5 xl:col-span-8">
          <SectionTitle
            title={t('Media analyser')}
            subtitle={t('JPEG, PNG, WebP or a short MP4/MOV clip')}
            action={<span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-16">{t('max 25 MB')}</span>}
          />

          <div
            className={`mt-4 rounded-2xl border-2 border-dashed p-5 transition ${dragging ? 'border-forest-500 bg-success-surface-5' : 'border-control-line-1 bg-inset-13'
              }`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {file ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative h-28 w-full overflow-hidden rounded-xl border border-control-line-7 bg-inset-4 sm:w-40">
                  {preview ? (
                    <img src={preview} alt={t('Selected upload preview')} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-6">
                      <Video className="h-6 w-6" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">{t('Video file')}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileImage className="h-4 w-4 text-success-5" />
                    <span className="truncate text-[12.5px] font-semibold text-ink">{file.name}</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-muted-9">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || 'unknown type'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-outline !px-3 !py-1.5 !text-[11px]" onClick={() => fileRef.current?.click()}>
                      {t('Replace')}
                    </button>
                    <button type="button" className="btn-ghost !px-3 !py-1.5 !text-[11px]" onClick={clearFile}>
                      <X className="h-3 w-3" /> {t('Clear')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 py-6 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-success-7 shadow-sm">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div className="text-[13px] font-semibold text-ink">{t('Drop an image or video, or browse files')}</div>
                <div className="max-w-sm text-[10.5px] leading-relaxed text-muted-9">
                  {t('Use a wildlife photo or video footage. The original and an annotated copy are stored locally.')}
                </div>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="camera">
                {t('Attribute to station')}
              </label>
              <select id="camera" className="field" value={cameraCode} onChange={(event) => setCameraCode(event.target.value)}>
                <option value="">{t('Unassigned')}</option>
                {cameras.data?.items?.map((camera) => (
                  <option key={camera.id} value={camera.code}>
                    {camera.code} · {camera.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="notes">
                {t('Field note (optional)')}
              </label>
              <input
                id="notes"
                className="field"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('e.g. Night capture, buffer track')}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[10px] leading-relaxed text-muted-9">
              {t('Animal labels are only applied above a calibrated confidence floor. Low-confidence crops are recorded as')} <span className="font-semibold">{t('unidentified')}</span>.
            </div>
            <button type="button" className="btn-primary shrink-0" onClick={analyze} disabled={analyzing || !file}>
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
              {analyzing ? 'Analysing…' : t('Run AI analysis')}
            </button>
          </div>

          {analyzing && (
            <div className="mt-4 rounded-xl border border-success-line-3 bg-success-surface-5 p-4">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold text-success-9">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t(STAGES[stage])}
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-success-surface-1">
                <div
                  className="h-full rounded-full bg-forest-500 transition-all duration-700"
                  style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
                />
              </div>
              <div className="mt-2 text-[9.5px] text-success-8/70">
                {t('First analysis can take longer while the local models load.')}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4">
              <ErrorBox message={error} />
            </div>
          )}
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <section className="card p-5">
            <SectionTitle title={t('Inference engine')} subtitle={t('Actual local model configuration')} />
            {ai.loading && !engine ? (
              <Loading label={t('Loading engine status…')} height="h-40" />
            ) : engine ? (
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between rounded-lg bg-inset-12 px-3 py-2">
                  <span className="text-[10.5px] text-muted-5">{t('Mode')}</span>
                  <span className="font-mono text-[10.5px] font-semibold text-success-8">{engine.mode}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-inset-12 px-3 py-2">
                  <span className="text-[10.5px] text-muted-5">{t('Weights loaded')}</span>
                  <span className="font-mono text-[10.5px] font-semibold text-success-8">
                    {engine.loaded ? t('yes') : t('on first analysis')}
                  </span>
                </div>
                {engine.device && (
                  <div className="flex items-center justify-between rounded-lg bg-inset-12 px-3 py-2">
                    <span className="text-[10.5px] text-muted-5">{t('Device')}</span>
                    <span className="font-mono text-[10.5px] font-semibold text-success-8">{engine.device}</span>
                  </div>
                )}
                <div className="rounded-lg border border-line-10 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-16">{t('Stage 1')}</div>
                  <div className="mt-0.5 text-[10.5px] font-medium leading-relaxed text-secondary-3">
                    {t(engine.detector || 'YOLO-World open-vocabulary animal localisation')}
                  </div>
                </div>
                <div className="rounded-lg border border-line-10 px-3 py-2">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-16">{t('Stage 2')}</div>
                  <div className="mt-0.5 text-[10.5px] font-medium leading-relaxed text-secondary-3">
                    {t(engine.classifier?.replace(/\bspecies\b/i, 'animal') || 'CLIP zero-shot animal classifier')}
                  </div>
                </div>
                {engine.message && (
                  <div className="rounded-lg border border-warning-line-2 bg-warning-surface-3 px-3 py-2 text-[10px] leading-relaxed text-warning-3">
                    {t(engine.message)}
                  </div>
                )}
                <div className="rounded-lg bg-forest-900 px-3 py-2.5 text-[9.5px] leading-relaxed text-forest-100/70">
                  {engine.confidence_note || engine.method}
                </div>
              </div>
            ) : (
              <ErrorBox message={"Engine status unavailable."} onRetry={ai.reload} />
            )}
          </section>

          <section className="card p-5">
            <SectionTitle title={t('Validated classes')} subtitle={t('Only these labels are emitted')} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ai.data?.supported_species?.map((species) => (
                <SpeciesTag key={species.key} species={species.key} name={species.name} color={species.color} />
              ))}
              <span className="inline-flex items-center gap-2 rounded-full border border-line-6 bg-raised/80 px-2.5 py-1 text-[11px] font-semibold text-secondary-12">
                <span className="h-2 w-2 rounded-full bg-[#64748B]" /> {t('Unidentified fallback')}
              </span>
            </div>
            <div className="mt-3 text-[9.5px] leading-relaxed text-muted-9">
              {t('The classifier is zero-shot: it can mislabel similar-looking animals. Always treat detections as decision support, not a confirmed identification.')}
            </div>
          </section>

          <section className="card-dark relative overflow-hidden p-5">
            <img src="/images/forest.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-950 to-forest-950/60" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-lime/80">
                <ShieldCheck className="h-3 w-3" /> {t('Storage & privacy')}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-forest-100/70">
                {t('Uploads stay on the local server. Public community pages never receive exact detection coordinates, camera positions or patrol locations.')}
              </p>
            </div>
          </section>
        </aside>
      </div>

      {result && (
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-line-10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="eyebrow">{t('Analysis complete')}</div>
              <h2 className="mt-1 font-display text-[20px] text-ink">
                {result.analysis.primary_species || t('No animal above threshold')}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="forest" dot>
                {result.analysis.elapsed_seconds}{t('s inference')}
              </Badge>
              <Badge tone="neutral">{result.analysis.media_type}</Badge>
              <Badge tone="warning">{t('not a live feed')}</Badge>
            </div>
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-xl border border-control-line-7 bg-inset-4">
                {result.analysis.annotated_url ? (
                  <EvidenceImage
                    path={result.analysis.annotated_url}
                    alt={t('Annotated AI analysis result')}
                    className="max-h-[460px] w-full object-contain"
                  />
                ) : (
                  <img
                    src={preview || speciesImage(result.analysis.primary_species?.toLowerCase() || 'forest')}
                    alt={t('Uploaded media')}
                    className="max-h-[460px] w-full object-contain"
                  />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-[9.5px] text-muted-13">
                <span>{t('Annotated copy generated by the local pipeline.')}</span>
                <span className="font-mono">{t('stored')} {uploaded.length} {t('record(s)')}</span>
              </div>
              {result.analysis.warnings?.length > 0 && (
                <div className="mt-2 rounded-lg border border-warning-line-2 bg-warning-surface-3 px-3 py-2 text-[10px] leading-relaxed text-warning-3">
                  {result.analysis.warnings.join(' ')}
                </div>
              )}
              {result.analysis.frame_samples?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.analysis.frame_samples.map((frame) => (
                    <span key={frame.frame} className="rounded-md bg-inset-1 px-2 py-1 font-mono text-[9px] text-secondary-14">
                      {t('frame')} {frame.frame} · {frame.seconds}{t('s ·')} {frame.detections} {t('det.')}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-5">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-16">{t('Detections returned')}</div>
              <div className="mt-2 space-y-2">
                {result.analysis.detections?.length ? (
                  result.analysis.detections.map((detection, index) => (
                    <div key={`${detection.species}-${index}`} className="rounded-xl border border-line-8 bg-raised/70 p-3">
                      <div className="flex items-center justify-between">
                        <SpeciesTag species={detection.species} name={detection.species.replaceAll('_', ' ')} />
                        <span className="font-mono text-[10px] font-semibold text-success-8">
                          {confidencePercent(detection.confidence)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[9.5px] text-muted-5">
                        <div>
                          {t('AI confidence')}
                          <div className="font-mono text-[10.5px] font-semibold text-ink">
                            {confidencePercent(detection.species_confidence)}
                          </div>
                        </div>
                        <div>
                          {t('Detector confidence')}
                          <div className="font-mono text-[10.5px] font-semibold text-ink">
                            {confidencePercent(detection.detector_confidence)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-1.5 text-[9px] text-muted-13">
                        {detection.is_full_frame ? t('Full-frame classification fallback') : t('Localised bounding box')}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-control-line-5 px-4 py-6 text-center text-[11px] text-muted-8">
                    {t('No animal was detected above the confidence floor. Nothing was stored as a detection.')}
                  </div>
                )}
              </div>
              {uploaded.length > 0 && (
                <div className="mt-3 rounded-xl border border-line-8 bg-inset-13 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-16">
                    {t('Stored records')}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {uploaded.map((record) => (
                      <div key={record.id} className="flex items-center justify-between text-[10.5px]">
                        <span className="text-secondary-4">
                          <span className="font-mono">#{record.id}</span> · {term('species', record.species, record.species_name)}
                        </span>
                        <span className="font-mono text-[9.5px] text-muted-5">
                          {t('risk')} {Math.round(record.risk_score)} · {term('risk', record.risk_level)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[9px] leading-relaxed text-muted-9">
                    {t('Stored at')} {dateTime(uploaded[0].detected_at)} {t('and included in the detection history.')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="card p-5">
        <SectionTitle
          title={t('Camera station registry')}
          subtitle={t('Illustrative positions and statuses; no live government feed is connected')}
          action={
            cameras.data ? (
              <div className="flex gap-1.5">
                <Badge tone="forest">{cameras.data.summary.online} {t('online')}</Badge>
                <Badge tone="warning">{cameras.data.summary.maintenance} {t('maintenance')}</Badge>
                <Badge tone="danger">{cameras.data.summary.offline} {t('offline')}</Badge>
              </div>
            ) : null
          }
        />
        {cameras.loading && !cameras.data ? (
          <div className="mt-4">
            <Loading label={t('Loading station registry…')} height="h-48" />
          </div>
        ) : cameras.error ? (
          <div className="mt-4">
            <ErrorBox message={cameras.error} onRetry={cameras.reload} />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {cameras.data.items.map((camera) => (
              <CameraStatusCard key={camera.id} camera={camera} lastDetection={camera.last_detection_at} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="card p-5 xl:col-span-8">
          <SectionTitle
            title={t('Recent detections')}
            subtitle={t('Every record carries source, confidence and risk context')}
            action={<Badge tone="neutral">{t('latest 8')}</Badge>}
          />
          <div className="mt-3">
            {recent.loading && !recent.data ? (
              <Loading height="h-64" />
            ) : recent.error ? (
              <ErrorBox message={recent.error} onRetry={recent.reload} />
            ) : (
              <DetectionTable items={recent.data?.items || []} />
            )}
          </div>
        </section>
        <section className="card p-5 xl:col-span-4">
          <SectionTitle title={t('Processing notes')} subtitle={t('What this module does and does not do')} />
          <div className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-secondary-10">
            {[
              [t('Images'), t('One localisation and classification pass. An annotated copy is stored.')],
              [t('Video'), t('Up to five frames are sampled. This is not continuous tracking.')],
              [t('Confidence'), t('Animal labels require a calibrated CLIP floor; otherwise unidentified.')],
              [t('Tracking'), t('Inferred only from sequential camera records, never from GPS.')],
              [t('Privacy'), t('Exact camera and detection positions stay behind guard authentication.')],
            ].map(([title, detail]) => (
              <div key={title} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-6" />
                <div>
                  <span className="font-semibold text-ink">{t(title)}. </span>
                  {detail}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-inset-1 px-3 py-2 text-[9.5px] text-muted-5">
            <Cpu className="h-3.5 w-3.5" /> {t('Local CPU inference · on-premise execution')}
          </div>
        </section>
      </div>
    </div>
  )
}
