import { useLanguage } from '@/i18n';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feedback } from '@/components/Feedback';
import type { Coordinates } from '@/services/api';
import { radius, useTheme } from '@/theme';

export type RiskZone = Coordinates & { id: number; color: string; radiusM: number };
type MapScene = { center: Coordinates; gps?: Coordinates; radiusM: number; zones: RiskZone[]; recenter: number; picker?: boolean; pin?: Coordinates; zoom?: number; dark?: boolean };

const html = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://unpkg.com 'unsafe-inline'; style-src https://unpkg.com 'unsafe-inline'; img-src https://tile.openstreetmap.org https://unpkg.com data:">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>
html,body,#map { width:100%;height:100%;margin:0;background:#dbe4da }
#tiles { position:absolute;right:10px;top:10px;z-index:900;background:white;color:#17261e;border-radius:4px;padding:5px;font:13px system-ui; }
.dark #map { background:#33483b }
.dark .leaflet-tile-pane { filter: invert(.87) hue-rotate(165deg) saturate(.62) brightness(.85); }
#tiles { top:auto;bottom:24px;left:10px;right:auto }
.leaflet-interactive[tabindex]:focus { outline:none;stroke:#163751;stroke-width:4; }
</style>
</head>
<body>
<div id="map" aria-label="Nearby wildlife warning map"></div>
<div id="tiles" role="status" hidden>Basemap tiles unavailable</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script>
(function () {
  function send(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
    else if (window.parent !== window) window.parent.postMessage(message, '*');
  }
  if (!window.L) { send({ type: 'error' }); return; }
  var map = L.map('map', { scrollWheelZoom: false });
  var overlay = L.layerGroup().addTo(map);
  var zoomIn = document.querySelector('.leaflet-control-zoom-in');
  var zoomOut = document.querySelector('.leaflet-control-zoom-out');
  function labelControl(element, label) {
    if (!element) return;
    element.title = label;
    element.setAttribute('aria-label', label);
  }
  var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  }).addTo(map);
  var tileStatus = document.getElementById('tiles');
  tiles.on('tileerror', function () { tileStatus.hidden = false; });
  tiles.on('tileload', function () { tileStatus.hidden = true; });
  var viewKey = '';
  var lastScene = '';
  var mapElement = document.getElementById('map');
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (viewKey && mapElement.clientWidth && mapElement.clientHeight) {
        map.invalidateSize({ animate: false, debounceMoveend: true });
      }
    }).observe(mapElement);
  }
  var choosing = false;
  map.on('click', function (event) {
    if (choosing) send({ type:'point', lat:event.latlng.lat, lon:L.Util.wrapNum(event.latlng.lng, [-180, 180]) });
  });
  function point(coords) { return [coords.lat, coords.lon]; }
  function render(scene) {
    var nextScene = JSON.stringify(scene);
    if (nextScene === lastScene) return;
    lastScene = nextScene;
    document.documentElement.classList.toggle('dark', scene.dark === true);
    document.documentElement.lang = scene.language;
    var labels = scene.labels;
    mapElement.setAttribute('aria-label', labels.map);
    tileStatus.textContent = labels.tiles;
    labelControl(zoomIn, labels.zoomIn);
    labelControl(zoomOut, labels.zoomOut);
    var center = point(scene.center);
    choosing = scene.picker === true;
    if (choosing) {
      overlay.clearLayers();
      if (viewKey !== scene.recenter) map.setView(center, scene.zoom || 14);
      viewKey = scene.recenter;
      if (scene.pin) L.marker(point(scene.pin), { interactive: false }).addTo(overlay);
      return;
    }
    var coverageStyle = { radius: scene.radiusM, color:'#215f9d', weight:2, dashArray:'7 5',
      fillOpacity:0.035, interactive:false };
    var nextView = [center[0], center[1], scene.radiusM, scene.recenter].join(':');
    if (!viewKey) map.setView(center, 12);
    overlay.clearLayers();
    var coverage = L.circle(center, coverageStyle).addTo(overlay);
    if (viewKey !== nextView) {
      map.fitBounds(coverage.getBounds(), { padding: [20, 20], animate: false, maxZoom: 14 });
      viewKey = nextView;
    }
    var groups = new Map();
    scene.zones.forEach(function (zone) {
      var key = [zone.lat, zone.lon, zone.radiusM].join(':');
      if (!groups.has(key)) groups.set(key, { zone: zone, ids: [] });
      groups.get(key).ids.push(zone.id);
    });
    Array.from(groups.values()).reverse().forEach(function (group) {
      var zone = group.zone;
      var circle = L.circle(point(zone), { radius:zone.radiusM, color:zone.color, weight:2.5,
        fillOpacity:0.27 }).addTo(overlay);
      var select = function () { send({ type:'zone', ids:group.ids }); };
      circle.on('click', select);
      var path = circle.getElement();
      if (path) {
        path.setAttribute('tabindex', '0');
        path.setAttribute('role', 'button');
        path.setAttribute('aria-label', group.ids.length > 1 ? labels.warnings : labels.warning);
        path.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
        });
      }
    });
    L.circleMarker(center, { radius:5, color:'#fff', fillColor:'#215f9d', fillOpacity:1, weight:2, interactive:false }).addTo(overlay);
    if (scene.gps) L.circleMarker(point(scene.gps), { radius:7, color:'#fff', fillColor:'#167ab6', fillOpacity:1,
      weight:3, interactive:false }).addTo(overlay);
  }
  window.ForestGuardRiskMap = { render: render };
  window.addEventListener('message', function (event) {
    if (event.source === window.parent && event.data && event.data.type === 'scene') render(event.data.scene);
  });
  send({ type:'ready' });
})();
</script>
</body>
</html>`;

const nativeSource = { html };
const frameStyle = { width: '100%', height: '100%', border: 0, display: 'block' };

export function RiskMapSurface({ scene, onSelect, onPick, fill = false }: {
  scene: MapScene; fill?: boolean; onSelect?: (ids: number[]) => void; onPick?: (point: Coordinates) => void;
}) {
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const webview = useRef<WebView<object>>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  const receive = useCallback((value: unknown) => {
    if (!value || typeof value !== 'object' || !('type' in value)) return;
    if (value.type === 'ready' || value.type === 'error') setStatus(value.type);
    if (value.type === 'zone' && 'ids' in value && Array.isArray(value.ids)) {
      onSelect?.(value.ids.filter((id): id is number => typeof id === 'number' && Number.isInteger(id)));
    }
    if (value.type === 'point' && 'lat' in value && 'lon' in value
        && typeof value.lat === 'number' && Math.abs(value.lat) <= 90
        && typeof value.lon === 'number' && Math.abs(value.lon) <= 180) {
      onPick?.({ lat: value.lat, lon: value.lon });
    }
  }, [onSelect, onPick]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: MessageEvent) => {
      if (frame.current && event.source === frame.current.contentWindow) receive(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [receive]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setStatus('error'), 15000);
    return () => clearTimeout(timer);
  }, [attempt, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const themedScene = { ...scene, dark: isDark, language, labels: {
      map: t('Nearby wildlife warning map'), tiles: t('Basemap tiles unavailable'),
      zoomIn: t('Zoom in on map'), zoomOut: t('Zoom out on map'),
      warning: t('Open wildlife warning'), warnings: t('Open wildlife warnings'),
    } };
    if (Platform.OS === 'web') frame.current?.contentWindow?.postMessage({ type: 'scene', scene: themedScene }, '*');
    else webview.current?.injectJavaScript(`window.ForestGuardRiskMap.render(${JSON.stringify(themedScene)}); true;`);
  }, [isDark, language, scene, status, t]);

  return <View style={[styles.surface, fill && styles.fill, scene.picker && styles.picker, { borderColor: colors.border, backgroundColor: colors.card }]}>
    {Platform.OS === 'web' ? createElement('iframe', { key: attempt, ref: frame, srcDoc: html, title: scene.picker ? t('Choose a location on the map') : t('Nearby wildlife risk map'),
      sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox', style: frameStyle }) : <WebView<object> key={attempt} ref={webview} source={nativeSource}
      originWhitelist={['*']} applicationNameForUserAgent="ForestGuardAI/1.0"
      onShouldStartLoadWithRequest={request => {
        if (request.url === 'https://www.openstreetmap.org/copyright') void Linking.openURL(request.url).catch(() => {});
        return request.url === 'about:blank';
      }}
      setSupportMultipleWindows={false} allowFileAccess={false} allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false} geolocationEnabled={false} scrollEnabled={false}
      onError={() => setStatus('error')} onMessage={event => {
        try { receive(JSON.parse(event.nativeEvent.data)); } catch { /* Ignore messages outside the map protocol. */ }
      }} />}
    {status !== 'ready' && <View style={[StyleSheet.absoluteFill, styles.feedback, { backgroundColor: colors.card }]}>
      {status === 'loading' ? <Feedback title={t('Loading map…')} kind="loading" />
        : <Feedback title={t('Could not load the map')} detail={t('Check your connection and try again.')} kind="error"
          retry={() => { setStatus('loading'); setAttempt(value => value + 1); }} />}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  picker: { height: 260 },
  surface: { overflow: 'hidden', borderWidth: 1, borderRadius: radius.input },
  feedback: { justifyContent: 'center', padding: 16 },
});
