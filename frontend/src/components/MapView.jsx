import { useLanguage } from '../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Loader2 } from 'lucide-react'
import { RISK_COLOR, SPECIES_COLOR } from '../utils/format'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const attribution = t => `&copy; <a href="https://www.openstreetmap.org/copyright">${escapeHtml(t('OpenStreetMap contributors'))}</a>`

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
  const geometry = feature?.geometry || feature
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
  jurisdiction,
  onSelectReport,
  selectedReportId,
}) {
  const { t, term } = useLanguage()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const overlayRef = useRef(null)
  const fittedRef = useRef(false)
  const zoomControl = useRef(null)
  const attributionRef = useRef(null)
  const incidentMarkers = useRef(new Map())
  const onSelectRef = useRef(onSelectDetection)
  onSelectRef.current = onSelectDetection
  const onSelectReportRef = useRef(onSelectReport)
  onSelectReportRef.current = onSelectReport
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
      center: jurisdiction ? [22, 79] : [21.732, 79.36],
      zoom: jurisdiction ? 5 : 11,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    })
    L.tileLayer(TILE_URL, {
      subdomains: 'abcd',
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map)
    zoomControl.current = L.control.zoom({ position: 'bottomright' }).addTo(map)
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
      attributionRef.current = null
      setReady(false)
    }
  }, [Boolean(jurisdiction)])

  useEffect(() => {
    if (!ready || !zoomControl.current) return
    const map = mapRef.current
    if (attributionRef.current) map.attributionControl.removeAttribution(attributionRef.current)
    attributionRef.current = attribution(t)
    map.attributionControl.addAttribution(attributionRef.current)
    const controls = zoomControl.current.getContainer()
    for (const [selector, label] of [['.leaflet-control-zoom-in', 'Zoom in on map'], ['.leaflet-control-zoom-out', 'Zoom out on map']]) {
      const button = controls.querySelector(selector)
      button.title = t(label)
      button.setAttribute('aria-label', t(label))
    }
  }, [ready, t])

  useEffect(() => {
    if (!ready || !jurisdiction?.boundary) return
    const bounds = L.geoJSON(jurisdiction.boundary).getBounds()
    if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 15, animate: false })
  }, [jurisdiction?.id, ready])

  useEffect(() => {
    const map = mapRef.current
    const overlay = overlayRef.current
    if (!map || !overlay || !ready) return
    const openIncident = [...incidentMarkers.current.entries()].find(([, marker]) => marker.isPopupOpen())?.[0]
    incidentMarkers.current.clear()
    overlay.clearLayers()

    if (layers.jurisdiction && jurisdiction?.boundary) {
      L.geoJSON(jurisdiction.boundary, {
        interactive: false,
        style: { color: '#14543a', weight: 3, dashArray: '8 5', fillOpacity: 0.07 },
      }).addTo(overlay)
    }

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
            .bindTooltip(t('Core forest habitat'), { sticky: true })
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
            `<strong>${escapeHtml(t('{risk} zone', { risk: term('risk', props.level || 'low') }))}</strong> · ${escapeHtml(t('{score} points', { score: props.score }))}<br/>${escapeHtml(props.dominant_species ? term('species', props.dominant_species) : t('mixed activity'))} · ${escapeHtml(t('{count} recent signals', { count: props.detections_21d || 0 }))}`,
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
            .bindTooltip(escapeHtml(`${village.name} · ${t('{risk} exposure', { risk: term('risk', level) })}`), { sticky: true })
            .addTo(overlay)
        }
        const center = Number.isFinite(village.lat) && Number.isFinite(village.lon)
          ? [village.lat, village.lon]
          : ring.length ? L.polygon(ring).getBounds().getCenter() : null
        if (center) {
          L.marker(center, {
            icon: L.divIcon({
              className: 'fg-marker-wrap',
              html: `<div class="village-label" style="position:relative">${escapeHtml(village.name)}</div>`,
              iconSize: [70, 16],
              iconAnchor: [35, 8],
            }),
            title: t('Village · {name}', { name: village.name }),
          }).bindTooltip(escapeHtml(`${village.name} · ${village.code} · ${t('{risk} exposure', { risk: term('risk', level) })}`)).addTo(overlay)
        }
        if (layers.alertCoverage && Number.isFinite(village.lat) && Number.isFinite(village.lon)) {
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
            `${escapeHtml(term('species', track.species, track.species_name))} · ${escapeHtml(
              term('direction', track.direction),
            )} · ${escapeHtml(t('{distance} km', { distance: track.distance_km }))}`,
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
            `<strong>${escapeHtml(camera.code)}</strong><br/>${escapeHtml(camera.name)}<br/>${escapeHtml(t('Status: {status}', { status: t(camera.status) }))}`,
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
            )}<br/>${escapeHtml(t(guard.status.replaceAll('_', ' ')))}`,
            { direction: 'top', offset: [0, -12] },
          )
          .addTo(overlay)
      })
    }

    if (layers.incidents && data?.incidents?.length) {
      data.incidents.forEach((incident) => {
        const marker = L.marker([incident.lat, incident.lon], { icon: pinIcon(RISK_COLOR[incident.severity] || RISK_COLOR.low, false) })
          .bindPopup(
            `<strong>${escapeHtml(incident.title || term('category', incident.category))}</strong><br/>${escapeHtml(
              incident.village_name || t('GPS location'),
            )}<br/>${escapeHtml(term('species', incident.species, incident.species_name))} · ${escapeHtml(term('severity', incident.severity))}${incident.report_id ? `<br/><a href="/reports?report=${Number(incident.report_id)}">${escapeHtml(t('Review report'))}</a>` : ''}`,
          )
          .addTo(overlay)
        incidentMarkers.current.set(incident.id, marker)
        if (incident.id === openIncident) marker.openPopup()
      })
    }

    if (data?.reports?.length) {
      const group = clusterReady ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 24 }) : L.layerGroup()
      for (const report of data.reports) {
        const point = [report.lat, report.lon]
        const color = RISK_COLOR[report.severity] || '#687f99'
        if (layers.riskZones && report.coverage_radius_m) {
          L.circle(point, { radius: report.coverage_radius_m, color, weight: 1.5,
            fillOpacity: 0.13, dashArray: '4 4', interactive: false }).addTo(overlay)
        }
        if (!layers[report.status]) continue
        const glyph = report.status === 'resolved' ? '✓' : report.status === 'pending' ? '?' : '!'
        const icon = L.divIcon({
          className: 'fg-marker-wrap',
          html: `<span class="operations-map-pin ${report.status}${selectedReportId === report.id ? ' selected' : ''}" style="--risk:${color}">${glyph}</span>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        })
        const marker = L.marker(point, { icon, alt: report.title, title: report.title })
          .bindTooltip(escapeHtml(report.title))
          .on('click', () => onSelectReportRef.current?.(report))
        group.addLayer(marker)
      }
      group.addTo(overlay)
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
          `<strong>${escapeHtml(term('species', detection.species, detection.species_name))}</strong> · ${Math.round(
            detection.confidence * 100,
          )}%<br/>${escapeHtml(detection.camera_code || t('Uploaded media'))} · ${escapeHtml(
            term('severity', detection.risk_level),
          )}`,
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
  }, [data, layers, ready, clusterReady, selectedDetectionId, selectedTrackId, jurisdiction, selectedReportId, t, term])

  useEffect(() => {
    if (!ready || !mapRef.current || !focus?.length) return
    mapRef.current.setView([focus[0], focus[1]], focus[2] || 13, { animate: true })
  }, [focus, ready])

  const speciesLegend = data?.detections?.length
    ? [...new Set(data.detections.map((item) => item.species))].slice(0, 6)
    : []

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-control-line-3 bg-inset-3 ${className}`} style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-inset-5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-success-8">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading geospatial layers…')}
          </div>
        </div>
      )}
      {showLegend && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[500] hidden max-w-[230px] rounded-xl border border-control-line-7 bg-parchment/95 p-3 shadow-card backdrop-blur sm:block">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-10">{t('Risk overlay')}</div>
          <div className="mt-1.5 flex items-center gap-3">
            {[
              [t('High'), RISK_COLOR.high],
              [t('Moderate'), RISK_COLOR.moderate],
              [t('Low'), RISK_COLOR.low],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 text-[9.5px] text-secondary-10">
                <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-line-10 pt-2">
            {speciesLegend.map((species) => (
              <span key={species} className="flex items-center gap-1 text-[9px] text-secondary-10">
                <span className="h-2 w-2 rounded-full" style={{ background: SPECIES_COLOR[species] }} />
                {term('species', species)}
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[8.5px] leading-tight text-muted-16">
            {t('C camera · G guard · ! incident. Zones are indicative.')}
          </div>
        </div>
      )}
    </div>
  )
}
