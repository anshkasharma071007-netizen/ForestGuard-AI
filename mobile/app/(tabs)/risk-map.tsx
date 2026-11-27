import { useIsFocused } from 'expo-router';
import { LocateFixed, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { AlertSearchControls } from '@/components/AlertSearchControls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { RiskMapSurface, type RiskZone } from '@/components/RiskMapSurface';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { formatTimestamp } from '@/format';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getNearbyAlerts, type Advisory } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const levels = {
  low: { label: 'Low', color: '#23734a' },
  moderate: { label: 'Moderate', color: '#a86200' },
  high: { label: 'High', color: '#b32825' },
};
const priority = ['low', 'moderate', 'high'];
const levelFor = (severity: string) => levels[severity as keyof typeof levels];

export default function RiskMapScreen() {
  const { access, profile, gps, alertLocation, alertRadius, locating } = useCitizen();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const active = useAppActive();
  const [recenter, setRecenter] = useState(0);
  const [selection, setSelection] = useState<number[]>([]);
  const location = alertLocation?.source === 'gps' ? alertLocation : profile?.savedAlertLocation;
  const center = useMemo(() => location ? { lat: location.lat, lon: location.lon } : null, [location]);
  const fetchAlerts = useCallback(async (signal: AbortSignal) => {
    const alerts = new Map<number, Advisory>();
    if (!alertLocation) return [];
    let offset = 0;
    while (!signal.aborted) {
      const page = await getNearbyAlerts(access, alertLocation, alertRadius, 'time', offset, signal);
      page.items.forEach(alert => alerts.set(alert.id, alert));
      if (page.nextOffset === null || page.nextOffset <= offset) break;
      offset = page.nextOffset;
    }
    return [...alerts.values()];
  }, [access, alertLocation, alertRadius]);
  const { state, reload, refreshing, refreshError } = usePublicData(fetchAlerts, focused && active && Boolean(center), 15000);
  const alerts = state.kind === 'ready' ? state.data : undefined;
  const zones = useMemo(() => {
    const result: RiskZone[] = [];
    for (const alert of [...(alerts ?? [])].sort((a, b) => priority.indexOf(b.severity) - priority.indexOf(a.severity))) {
      const level = levelFor(alert.severity);
      const uncertainty = alert.uncertaintyRadiusM;
      if (!level || !uncertainty || uncertainty <= 0) continue;
      for (const point of alert.approximateLocations) {
        result.push({ ...point, id: alert.id, color: level.color, radiusM: uncertainty });
      }
    }
    // The map groups identical centers using the first (most severe) warning.
    return result;
  }, [alerts]);
  const select = useCallback((ids: number[]) => setSelection(ids), []);
  const scene = useMemo(() => center ? { center, gps, radiusM: alertRadius * 1000, zones, recenter } : null,
    [center, gps, alertRadius, zones, recenter]);
  const selected = alerts?.filter(alert => selection.includes(alert.id)) ?? [];

  return <Screen tab>
    <ScreenHeader title="Nearby risk map" action={center ? <IconAction icon={RefreshCw} label="Refresh risk map"
      onPress={reload} loading={refreshing} /> : undefined} />
    <View style={styles.section}>
      <AlertSearchControls />
      {!center && !locating && <Feedback title="Choose a map location" detail="Use current GPS or save a location in Profile." />}
      {scene && <>
        <View style={styles.mapHeader}>
          <SupportingText>{alertRadius} km search area</SupportingText>
          <IconAction icon={LocateFixed} label="Recenter map" onPress={() => setRecenter(value => value + 1)} />
        </View>
        <RiskMapSurface scene={scene} onSelect={select} />
        <View style={styles.legend}>
          {Object.values(levels).map(level => <View key={level.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: level.color }]} />
            <SupportingText>{level.label}</SupportingText>
          </View>)}
          <View style={styles.legendItem}>
            <View style={[styles.outline, { borderColor: '#4a84c2' }]} />
            <SupportingText>Search radius</SupportingText>
          </View>
          {gps && <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: '#167ab6' }]} />
            <SupportingText>Your GPS</SupportingText>
          </View>}
        </View>
        <SupportingText>Colored circles show approximate report areas. Their size reflects location uncertainty only.</SupportingText>
        {state.kind === 'loading' && <Feedback title="Loading nearby alerts…" kind="loading" />}
        {'message' in state && <Feedback title="Could not load nearby alerts" detail={state.message} kind="error" retry={reload} />}
        {alerts?.length === 0 && <Feedback title={`No active alerts within ${alertRadius} km`} />}
        {!!alerts?.length && <TextAction label={`View ${alerts.length} active ${alerts.length === 1 ? 'warning' : 'warnings'}`}
          onPress={() => select(alerts.map(alert => alert.id))} />}
        {!!refreshError && <SupportingText error>{refreshError}</SupportingText>}
      </>}
    </View>
    <Modal visible={focused && selected.length > 0} transparent animationType="slide" onRequestClose={() => setSelection([])}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.mapHeader}>
            <Text accessibilityRole="header" style={[typeScale.card, { color: colors.primaryText }]}>Wildlife warnings</Text>
            <IconAction icon={X} label="Close warning details" onPress={() => setSelection([])} />
          </View>
          <ScrollView contentContainerStyle={styles.section}>
            {selected.map(alert => <View key={alert.id} style={[styles.advisory, { borderColor: colors.border }]}>
              <Text style={[typeScale.card, { color: colors.primaryText }]}>{alert.speciesName}</Text>
              <SupportingText>{levelFor(alert.severity)?.label ?? alert.severity} risk · {
                alert.status === 'acknowledged' ? 'Acknowledged' : alert.status === 'responding' ? 'Response underway' : 'Active'
              }</SupportingText>
              <SupportingText>{alert.distanceKm === undefined ? alert.area
                : alert.distanceKm === 0 ? `Under 1 km to the mapped area center · ${alert.area}`
                  : `About ${alert.distanceKm} km to the mapped area center · ${alert.area}`}</SupportingText>
              <SupportingText>Published {formatTimestamp(alert.publishedAt)}</SupportingText>
              {alert.isSimulated && <SupportingText>Simulated warning</SupportingText>}
              <Text style={[typeScale.body, { color: colors.primaryText }]}>{alert.advice || 'Keep your distance and follow directions from local forest officials.'}</Text>
            </View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  outline: { width: 12, height: 12, borderWidth: 2, borderStyle: 'dashed', borderRadius: 6 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10261d88' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: radius.input, borderTopRightRadius: radius.input, padding: spacing.lg },
  advisory: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.xs },
});
