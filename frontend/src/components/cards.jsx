import { ArrowUpRight, Camera, ChevronRight, MapPin } from 'lucide-react'
import {
  SPECIES_COLOR,
  confidencePercent,
  directionLabel,
  formatDateTime,
  speciesImage,
  statusTone,
  timeAgo,
} from '../utils/format'
import { mediaUrl } from '../api/client'
import { Badge, RiskBadge, SpeciesTag, StatusBadge } from './ui'

export function DetectionAvatar({ detection, size = 'md' }) {
  const dimension = size === 'sm' ? 'h-9 w-11' : 'h-11 w-14'
  const src = mediaUrl(detection.annotated_url || detection.image_url)
  return (
    <div className={`${dimension} shrink-0 overflow-hidden rounded-lg border border-[#ded8c8] bg-[#e6e9df]`}>
      {src ? (
        <img src={src} alt={`${detection.species_name} detection`} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <img src={speciesImage(detection.species)} alt="" className="h-full w-full object-cover opacity-70" loading="lazy" />
      )}
    </div>
  )
}

export function DetectionTable({ items, onSelect, compact = false, emptyLabel = 'No detections match these filters.' }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#ddd7c8] px-4 py-10 text-center text-[12px] text-[#8a9187]">
        {emptyLabel}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[620px]">
        <thead>
          <tr>
            <th>Detection</th>
            <th>Confidence</th>
            <th>Station</th>
            {!compact && <th>Observed</th>}
            <th>Risk</th>
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
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#8a9187]">
                      <span className="font-mono">#{detection.id}</span>
                      {detection.is_simulated ? (
                        <span className="rounded bg-[#f1ecdd] px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider">
                          demo
                        </span>
                      ) : (
                        <span className="rounded bg-[#e7f2e9] px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider text-[#245c3b]">
                          upload
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[#4c584e]">{confidencePercent(detection.confidence)}</span>
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-[#eae5d8]">
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
                <div className="flex items-center gap-1.5 text-[11.5px] text-[#4b574e]">
                  <Camera className="h-3 w-3 text-[#95a094]" />
                  {detection.camera_code || 'Upload'}
                </div>
                <div className="mt-0.5 text-[10px] text-[#92988f]">{detection.zone || '—'}</div>
              </td>
              {!compact && (
                <td>
                  <div className="text-[11.5px] text-[#4b574e]">{formatDateTime(detection.detected_at)}</div>
                  <div className="mt-0.5 text-[10px] text-[#92988f]">{timeAgo(detection.detected_at)}</div>
                </td>
              )}
              <td>
                <RiskBadge level={detection.risk_level} score={detection.risk_score} />
              </td>
              <td>
                <ChevronRight className="h-3.5 w-3.5 text-[#b3b8ae]" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AlertRow({ alert, onClick, actions, dense = false }) {
  return (
    <div
      className={`group rounded-xl border border-[#e6e0d2] bg-white/70 transition hover:border-[#c9d6c3] hover:bg-white ${
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
            <Badge tone={alert.severity === 'high' ? 'danger' : 'warning'}>{alert.severity} priority</Badge>
            <StatusBadge status={alert.status} />
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#737d72]">{alert.reason}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#92988f]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />
              {alert.village_names?.join(', ') || 'Buffer area'}
            </span>
            <span>{timeAgo(alert.created_at)}</span>
            <span className="font-mono">score {alert.score}</span>
            <span className="rounded bg-[#f2ecdc] px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wider text-[#877a5b]">
              {alert.risk_basis === 'confirmed_movement' ? 'movement-supported' : 'proximity'}
            </span>
          </div>
          {actions && <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>{actions}</div>}
        </div>
        {onClick && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#b3b8ae] transition group-hover:text-forest-500" />}
      </div>
    </div>
  )
}

export function VillageRiskRow({ village, exposure }) {
  const tone = statusTone(village.risk_level)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e9e4d7] bg-white/60 px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f2eee2] text-[10px] font-bold text-[#6f7668]">
        {village.name?.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-ink">{village.name}</div>
        <div className="text-[10px] text-[#8b9188]">
          {village.population?.toLocaleString('en-IN')} residents · {village.households} households
        </div>
      </div>
      <div className="text-right">
        <RiskBadge level={village.risk_level} />
        {exposure !== undefined && <div className="mt-1 text-[9.5px] text-[#949a91]">{exposure} nearby signals</div>}
      </div>
    </div>
  )
}

export function TrackCard({ track, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition ${
        selected
          ? 'border-forest-500 bg-forest-50 shadow-[0_0_0_2px_rgba(47,114,80,0.12)]'
          : 'border-[#e4dfd1] bg-white/70 hover:border-[#c9d6c3] hover:bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <SpeciesTag species={track.species} name={track.species_name} color={track.color} />
        <span className="font-mono text-[10px] text-[#8d938a]">#{track.id}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <div className="uppercase tracking-[0.12em] text-[#9a998e]">Direction</div>
          <div className="mt-0.5 font-semibold text-[#435046]">{directionLabel(track.direction)}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.12em] text-[#9a998e]">Path</div>
          <div className="mt-0.5 font-mono font-semibold text-[#435046]">{track.distance_km} km</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.12em] text-[#9a998e]">Points</div>
          <div className="mt-0.5 font-mono font-semibold text-[#435046]">{track.point_count}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[#ece7da] pt-2 text-[10px] text-[#8d938a]">
        <span>Ended {timeAgo(track.ended_at)}</span>
        <span className="font-mono">avg conf. {confidencePercent(track.confidence)}</span>
      </div>
    </button>
  )
}

export function CameraStatusCard({ camera, lastDetection }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[#e2ddce] bg-parchment">
      <div className="relative h-24 overflow-hidden bg-forest-900">
        <img src="/images/forest.webp" alt="" className="h-full w-full object-cover opacity-40 transition group-hover:scale-105 group-hover:opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 to-transparent" />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-forest-950/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-forest-100 backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              camera.status === 'online' ? 'bg-lime' : camera.status === 'maintenance' ? 'bg-amber' : 'bg-[#d06a52]'
            }`}
          />
          {camera.status}
        </div>
        <div className="absolute bottom-2 left-2.5 font-mono text-[10px] font-semibold text-white">{camera.code}</div>
        <div className="absolute bottom-2 right-2 rounded bg-black/30 px-1.5 py-0.5 text-[7.5px] font-medium uppercase tracking-wider text-white/70">
          demo station
        </div>
      </div>
      <div className="p-3">
        <div className="truncate text-[11.5px] font-semibold text-ink">{camera.name}</div>
        <div className="mt-0.5 text-[9.5px] text-[#8b9188]">{camera.zone}</div>
        <div className="mt-2 flex items-center justify-between text-[9.5px]">
          <span className="text-[#92988f]">{lastDetection ? `Last ${timeAgo(lastDetection)}` : 'No detections'}</span>
          <span className="font-semibold text-forest-600">Registry</span>
        </div>
      </div>
    </div>
  )
}
