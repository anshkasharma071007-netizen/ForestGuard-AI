import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Loader2 } from 'lucide-react'
import { RISK_COLOR, SPECIES_COLOR, directionLabel } from '../utils/format'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const DEFAULT_LAYERS = {
  forest: true,
  villages: true,
  riskZones: true,
  alertCoverage: false,
  cameras: true,
  detections: true,
  incidents: true,
  guards: true,
  tracks: true,
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  })
}

function pinIcon(color, selected = false) {
  return L.divIcon({
    className: 'fg-marker-wrap',
    html: `<div class="fg-pin ${selected ? 'is-selected' : ''}" style="--pin:${color}"><span></span></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function glyphIcon(kind, label) {
  if (kind === 'incident') {
    return L.divIcon({
      className: 'fg-marker-wrap',
      html: `<div class="fg-glyph incident"><span>${label}</span></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }
  return L.divIcon({
    className: 'fg-marker-wrap',
    html: `<div class="fg-glyph ${kind}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function ringOf(feature) {
  const geometry = feature?.geometry
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates[0].map(([lon, lat]) => [lat, lon])
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0][0].map(([lon, lat]) => [lat, lon])
  return []
}

export default function MapView({
  data,
  layers: layerInput = {},
  height = '520px',
  onSelectDetection,
  selectedDetectionId,
  selectedTrackId,
  focus,
  showLegend = true,
  className = '',
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const overlayRef = useRef(null)
  const fittedRef = useRef(false)
  const onSelectRef = useRef(onSelectDetection)
  onSelectRef.current = onSelectDetection
  const layerKey = JSON.stringify(layerInput)
  const layers = useMemo(
    () => ({ ...DEFAULT_LAYERS, ...JSON.parse(layerKey) }),
    [layerKey],
  )
  const [clusterReady, setClusterReady] = useState(Boolean(L.markerClusterGroup))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.L) window.L = L
    if (L.markerClusterGroup) {
      setClusterReady(true)
      return undefined
    }
    let active = true
    import('leaflet.markercluster')
      .then(() => active && setClusterReady(true))
      .catch(() => active && setClusterReady(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = L.map(containerRef.current, {
      center: [21.732, 79.36],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    })
    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    overlayRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const timer = setTimeout(() => {
      map.invalidateSize()
      setReady(true)
    }, 120)
    return () => {
      clearTimeout(timer)
      map.remove()
      mapRef.current = null
      overlayRef.current = null
      fittedRef.current = false
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const overlay = overlayRef.current
    if (!map || !overlay || !ready) return
    overlay.clearLayers()

    const studyFeatures = data?.study_area?.features || []
    if (layers.forest) {
      studyFeatures.forEach((feature) => {
        const ring = ringOf(feature)
        if (!ring.length) return
        const layerName = feature.properties?.layer
        if (layerName === 'landscape') {
          L.polygon(ring, {
            color: '#3F6B4F',
            weight: 1.4,
            dashArray: '5 7',
            fill: false,
            interactive: false,
          }).addTo(overlay)
        }
        if (layerName === 'core') {
          L.polygon(ring, {
            color: '#2F7250',
            weight: 1,
            fillColor: '#2F7250',
            fillOpacity: 0.06,
            interactive: false,
          })
            .bindTooltip('Core habitat (illustrative)', { sticky: true })
            .addTo(overlay)
        }
      })
    }

    if (layers.riskZones && data?.risk_zones?.features?.length) {
      L.geoJSON(data.risk_zones, {
        style: (feature) => {
          const level = feature.properties?.level || 'low'
          return {
            color: RISK_COLOR[level],
            weight: 0.4,
            opacity: 0.35,
            fillColor: RISK_COLOR[level],
            fillOpacity: level === 'high' ? 0.24 : 0.14,
          }
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {}
          layer.bindTooltip(
            `<strong>${escapeHtml(props.level || 'risk')} zone</strong> · score ${escapeHtml(
              props.score,
            )}<br/>${escapeHtml(props.dominant_species || 'mixed activity')} · ${
              props.detections_21d || 0
            } recent signals`,
            { sticky: true },
          )
        },
      }).addTo(overlay)
    }

    if (layers.villages && data?.villages?.length) {
      data.villages.forEach((village) => {
        const ring = ringOf(village.boundary)
        const level = village.risk_level || 'low'
        if (ring.length) {
          L.polygon(ring, {
            color: '#6B5A35',
            weight: 1.4,
            dashArray: '3 4',
            fillColor: RISK_COLOR[level],
            fillOpacity: 0.12,
          })
            .bindTooltip(`${village.name} · ${level} exposure`, { sticky: true })
            .addTo(overlay)
          const center = L.polygon(ring).getBounds().getCenter()
          L.marker(center, {
            icon: L.divIcon({
              className: 'fg-marker-wrap',
              html: `<div class="village-label" style="position:relative">${escapeHtml(village.name)}</div>`,
              iconSize: [70, 16],
              iconAnchor: [35, 8],
            }),
            interactive: false,
            keyboard: false,
          }).addTo(overlay)
        }
        if (layers.alertCoverage && village.lat && village.lon) {
          L.circle([village.lat, village.lon], {
            radius: (data?.risk?.alert_radius_km || 3.5) * 1000,
            color: '#B85C38',
            weight: 1,
            dashArray: '4 6',
            fillColor: '#B85C38',
            fillOpacity: 0.05,
            interactive: false,
          }).addTo(overlay)
        }
      })
    }

    if (layers.tracks && data?.tracks?.length) {
      data.tracks.forEach((track) => {
        if (!track.points?.length) return
        const selected = String(track.id) === String(selectedTrackId)
        const color = SPECIES_COLOR[track.species] || '#2F7250'
        L.polyline(track.points, {
          color,
          weight: selected ? 4 : 2,
          opacity: selected ? 0.95 : 0.55,
          dashArray: selected ? undefined : '5 7',
        })
          .bindTooltip(
            `${escapeHtml(track.species_name)} · ${escapeHtml(
              directionLabel(track.direction),
            )} · ${track.distance_km} km`,
            { sticky: true },
          )
          .addTo(overlay)
        track.points.forEach((point, index) => {
          if (index !== track.points.length - 1) return
          L.circleMarker(point, {
            radius: 4,
            color,
            weight: 2,
            fillColor: '#FBFAF5',
            fillOpacity: 1,
          }).addTo(overlay)
        })
      })
    }

    if (layers.cameras && data?.cameras?.length) {
      data.cameras.forEach((camera) => {
        if (camera.lat == null) return
        L.marker([camera.lat, camera.lon], { icon: glyphIcon('camera', 'C') })
          .bindTooltip(
            `<strong>${escapeHtml(camera.code)}</strong><br/>${escapeHtml(camera.name)}<br/>Status: ${escapeHtml(
              camera.status,
            )}`,
            { direction: 'top', offset: [0, -10] },
          )
          .addTo(overlay)
      })
    }

    if (layers.guards && data?.guards?.length) {
      data.guards.forEach((guard) => {
        if (guard.lat == null) return
        L.marker([guard.lat, guard.lon], { icon: glyphIcon('guard', 'G') })
          .bindTooltip(
            `<strong>${escapeHtml(guard.name)}</strong><br/>${escapeHtml(guard.badge_id)} · ${escapeHtml(
              guard.zone,
            )}<br/>${escapeHtml(guard.status)}`,
            { direction: 'top', offset: [0, -12] },
          )
          .addTo(overlay)
      })
    }

    if (layers.incidents && data?.incidents?.length) {
      data.incidents.forEach((incident) => {
        L.marker([incident.lat, incident.lon], { icon: glyphIcon('incident', '!') })
          .bindPopup(
            `<strong>${escapeHtml(incident.category.replaceAll('_', ' '))}</strong><br/>${escapeHtml(
              incident.village_name || 'Buffer area',
            )}<br/>${escapeHtml(incident.severity)} · ${escapeHtml(incident.status)}`,
          )
          .addTo(overlay)
      })
    }

    if (layers.detections && data?.detections?.length) {
      const group =
        clusterReady && L.markerClusterGroup
          ? L.markerClusterGroup({
              showCoverageOnHover: false,
              maxClusterRadius: 46,
              spiderfyOnMaxZoom: true,
              disableClusteringAtZoom: 15,
              iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount()
                return L.divIcon({
                  className: 'fg-marker-wrap',
                  html: `<div class="fg-cluster ${count < 10 ? 'small' : ''}">${count}</div>`,
                  iconSize: count < 10 ? [32, 32] : [40, 40],
                  iconAnchor: count < 10 ? [16, 16] : [20, 20],
                })
              },
            })
          : L.layerGroup()

      data.detections.forEach((detection) => {
        const selected = String(detection.id) === String(selectedDetectionId)
        const color = SPECIES_COLOR[detection.species] || '#4C9069'
        const marker = L.marker([detection.lat, detection.lon], {
          icon: pinIcon(color, selected),
          zIndexOffset: selected ? 1000 : 0,
        })
        marker.bindTooltip(
          `<strong>${escapeHtml(detection.species_name)}</strong> · ${Math.round(
            detection.confidence * 100,
          )}%<br/>${escapeHtml(detection.camera_code || 'Uploaded media')} · ${escapeHtml(
            detection.risk_level,
          )} risk`,
          { direction: 'top', offset: [0, -8] },
        )
        marker.on('click', () => onSelectRef.current?.(detection))
        group.addLayer(marker)
      })
      group.addTo(overlay)
    }

    if (!fittedRef.current && studyFeatures.length) {
      const landscape = studyFeatures.find((feature) => feature.properties?.layer === 'landscape')
      const ring = ringOf(landscape)
      if (ring.length) {
        map.fitBounds(L.latLngBounds(ring), { padding: [30, 30] })
        fittedRef.current = true
      }
    }
  }, [data, layers, ready, clusterReady, selectedDetectionId, selectedTrackId])

  useEffect(() => {
    if (!mapRef.current || !focus?.length) return
    mapRef.current.setView(focus, focus[2] || 13, { animate: true })
  }, [focus])

  const speciesLegend = data?.detections?.length
    ? [...new Set(data.detections.map((item) => item.species))].slice(0, 6)
    : []

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[#dcd6c7] bg-[#e3e9df] ${className}`} style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#e7ece4]">
          <div className="flex items-center gap-2 text-[12px] font-medium text-forest-700">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading geospatial layers…
          </div>
        </div>
      )}
      {showLegend && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[500] hidden max-w-[230px] rounded-xl border border-[#ded8c8] bg-parchment/95 p-3 shadow-card backdrop-blur sm:block">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#8d9187]">Risk overlay</div>
          <div className="mt-1.5 flex items-center gap-3">
            {[
              ['High', RISK_COLOR.high],
              ['Moderate', RISK_COLOR.moderate],
              ['Low', RISK_COLOR.low],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-[9.5px] text-[#667063]">
                <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-[#e8e3d6] pt-2">
            {speciesLegend.map((species) => (
              <span key={species} className="flex items-center gap-1 text-[9px] text-[#667063]">
                <span className="h-2 w-2 rounded-full" style={{ background: SPECIES_COLOR[species] }} />
                {species.replaceAll('_', ' ')}
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[8.5px] leading-tight text-[#9a998e]">
            C camera · G guard · ! incident. Zones are indicative.
          </div>
        </div>
      )}
    </div>
  )
}
