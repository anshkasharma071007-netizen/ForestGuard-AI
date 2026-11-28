import { useLanguage } from '../i18n'
import { ArrowUpRight, Camera, ChevronRight, MapPin } from 'lucide-react'
import {
  SPECIES_COLOR,
  confidencePercent,
  speciesImage,
  statusTone,
} from '../utils/format'
import EvidenceImage from './EvidenceImage'
import { Badge, RiskBadge, SpeciesTag, StatusBadge } from './ui'

export function DetectionAvatar({ detection, size = 'md' }) {
  const { t, term } = useLanguage()
  const dimension = size === 'sm' ? 'h-9 w-11' : 'h-11 w-14'
  return (
    <div className={`${dimension} shrink-0 overflow-hidden rounded-lg border border-control-line-7 bg-inset-4`}>
      <EvidenceImage path={detection.annotated_url || detection.image_url} fallback={speciesImage(detection.species)}
        alt={t('Detection · {animal}', { animal: term('species', detection.species, detection.species_name) })} className="h-full w-full object-cover" loading="lazy" />
    </div>
  )
}

export function DetectionTable({ items, onSelect, compact = false, emptyLabel = 'No detections match these filters.' }) {
  const { t, dateTime, relativeTime } = useLanguage()
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-control-line-5 px-4 py-10 text-center text-[12px] text-muted-8">
        {t(emptyLabel)}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[620px]">
        <thead>
          <tr>
            <th>{t('Detection')}</th>
            <th>{t('Confidence')}</th>
            <th>{t('Station')}</th>
            {!compact && <th>{t('Observed')}</th>}
            <th>{t('Risk')}</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {items.map((detection) => (
            <tr
              key={detection.id}
              className={onSelect ? 'cursor-pointer' : ''}
              onClick={() => onSelect?.(detection)}
            >
              <td>
                <div className="flex items-center gap-3">
                  <DetectionAvatar detection={detection} size={compact ? 'sm' : 'md'} />
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-ink">{detection.species_name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-8">
                      <span className="font-mono">#{detection.id}</span>
                      {detection.is_simulated ? (
                        <span className="rounded bg-inset-7 px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider">
                          {t('station')}
                        </span>
                      ) : (
                        <span className="rounded bg-success-surface-2 px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider text-success-1">
                          {t('upload')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-secondary-5">{confidencePercent(detection.confidence)}</span>
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-line-4">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(detection.confidence * 100)}%`,
                        background: SPECIES_COLOR[detection.species] || '#2F7250',
                      }}
                    />
                  </div>
                </div>
              </td>
              <td>
                <div className="flex items-center gap-1.5 text-[11.5px] text-secondary-4">
                  <Camera className="h-3 w-3 text-muted-15" />
                  {detection.camera_code || t('Upload')}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-13">{detection.zone || '—'}</div>
              </td>
              {!compact && (
                <td>
                  <div className="text-[11.5px] text-secondary-4">{dateTime(detection.detected_at)}</div>
                  <div className="mt-0.5 text-[10px] text-muted-13">{relativeTime(detection.detected_at)}</div>
                </td>
              )}
              <td>
                <RiskBadge level={detection.risk_level} score={detection.risk_score} />
              </td>
              <td>
                <ChevronRight className="h-3.5 w-3.5 text-muted-18" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AlertRow({ alert, onClick, actions, dense = false }) {
  const { t, relativeTime, term, alertReason } = useLanguage()
  return (
    <div
      className={`group rounded-xl border border-line-8 bg-raised/70 transition hover:border-success-line-5 hover:bg-hover-white ${
        dense ? 'p-3' : 'p-3.5'
      } ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: alert.color || SPECIES_COLOR[alert.species] }}
        >
          {alert.species_name?.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-ink">{alert.species_name}</span>
            <Badge tone={alert.severity === 'high' ? 'danger' : 'warning'}>{t('{risk} priority', { risk: term('risk', alert.severity) })}</Badge>
            <StatusBadge domain="alert" status={alert.status} />
            <Badge>{alert.is_simulated ? t('Simulated') : alert.incident_id ? t('Verified report') : t('Field detection')}</Badge>
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-1">{alertReason(alert.reason)}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-13">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />
              {alert.village_names?.join(', ') || t('Buffer area')}
            </span>
            <span>{relativeTime(alert.created_at)}</span>
            <span className="font-mono">{t('score')} {alert.score}</span>
            <span className="rounded bg-inset-9 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider text-warning-4">
              {alert.risk_basis === 'confirmed_movement' ? t('movement-supported') : t('proximity')}
            </span>
          </div>
          {actions && <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>{actions}</div>}
        </div>
        {onClick && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-18 transition group-hover:text-success-5" />}
      </div>
    </div>
  )
}

export function VillageRiskRow({ village, exposure }) {
  const { t } = useLanguage()
  const tone = statusTone(village.risk_level)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line-11 bg-raised/60 px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-inset-1 text-[10px] font-bold text-secondary-14">
        {village.name?.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-ink">{village.name}</div>
        <div className="text-[10px] text-muted-9">
          {village.population?.toLocaleString('en-IN')} {t('residents ·')} {village.households} {t('households')}
        </div>
      </div>
      <div className="text-right">
        <RiskBadge level={village.risk_level} />
        {exposure !== undefined && <div className="mt-1 text-[9.5px] text-muted-14">{exposure} {t('nearby signals')}</div>}
      </div>
    </div>
  )
}

export function TrackCard({ track, selected, onClick }) {
  const { t, relativeTime, term } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-forest-500 bg-success-surface-5 shadow-[0_0_0_2px_rgba(47,114,80,0.12)]'
          : 'border-line-7 bg-raised/70 hover:border-success-line-5 hover:bg-hover-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <SpeciesTag species={track.species} name={track.species_name} color={track.color} />
        <span className="font-mono text-[10px] text-muted-11">#{track.id}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <div className="uppercase tracking-[0.12em] text-muted-16">{t('Direction')}</div>
          <div className="mt-0.5 font-semibold text-secondary-3">{term('direction', track.direction)}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.12em] text-muted-16">{t('Path')}</div>
          <div className="mt-0.5 font-mono font-semibold text-secondary-3">{track.distance_km} {t('km')}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.12em] text-muted-16">{t('Points')}</div>
          <div className="mt-0.5 font-mono font-semibold text-secondary-3">{track.point_count}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line-13 pt-2 text-[10px] text-muted-11">
        <span>{t('Ended')} {relativeTime(track.ended_at)}</span>
        <span className="font-mono">{t('avg conf.')} {confidencePercent(track.confidence)}</span>
      </div>
    </button>
  )
}

export function CameraStatusCard({ camera, lastDetection }) {
  const { t, relativeTime } = useLanguage()
  return (
    <div className="group relative overflow-hidden rounded-xl border border-line-5 bg-parchment">
      <div className="relative h-24 overflow-hidden bg-forest-900">
        <img src="/images/forest.webp" alt="" className="h-full w-full object-cover opacity-40 transition group-hover:scale-105 group-hover:opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 to-transparent" />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-forest-950/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-forest-100 backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              camera.status === 'online' ? 'bg-lime' : camera.status === 'maintenance' ? 'bg-amber' : 'bg-[#d06a52]'
            }`}
          />
          {t(camera.status)}
        </div>
        <div className="absolute bottom-2 left-2.5 font-mono text-[10px] font-semibold text-white">{camera.code}</div>
        <div className="absolute bottom-2 right-2 rounded bg-black/30 px-1.5 py-0.5 text-[7.5px] font-medium uppercase tracking-wider text-white/70">
          {t('camera station')}
        </div>
      </div>
      <div className="p-3">
        <div className="truncate text-[11.5px] font-semibold text-ink">{camera.name}</div>
        <div className="mt-0.5 text-[9.5px] text-muted-9">{camera.zone}</div>
        <div className="mt-2 flex items-center justify-between text-[9.5px]">
          <span className="text-muted-13">{lastDetection ? t('Last {time}', { time: relativeTime(lastDetection) }) : t('No detections')}</span>
          <span className="font-semibold text-success-7">{t('Registry')}</span>
        </div>
      </div>
    </div>
  )
}
