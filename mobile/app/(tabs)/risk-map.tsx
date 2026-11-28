import { useLanguage } from '@/i18n';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Info, LocateFixed, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCitizen } from '@/citizen-context';
import { AdvisoryDetails, AdvisoryList } from '@/components/AdvisoryList';
import { AlertSearchControls } from '@/components/AlertSearchControls';
import { Feedback, RiskPill, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { RiskMapSurface, type RiskZone } from '@/components/RiskMapSurface';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Surface } from '@/components/Surface';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getAllNearbyAlerts } from '@/services/api';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';

const levels = {
  low: { label: 'Low risk', color: '#23734a', rank: 0 },
  moderate: { label: 'Moderate risk', color: '#a86200', rank: 1 },
  high: { label: 'High risk', color: '#b32825', rank: 2 },
};
const levelFor = (severity: string) => levels[severity as keyof typeof levels];

export default function RiskMapScreen() {
  const { t, advisoryTitle, dateTime } = useLanguage();
  const { access, profile, gps, alertLocation, alertRadius } = useCitizen();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const active = useAppActive();
  const [recenter, setRecenter] = useState(0);
  const [selection, setSelection] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const { alert } = useLocalSearchParams<{ alert?: string }>();
  useEffect(() => {
    if (focused && alert && /^\d+$/.test(alert)) {
      setSelection([Number(alert)]);
      router.setParams({ alert: '' });
    }
  }, [alert, focused]);

  const location = alertLocation?.source === 'saved' ? profile?.savedAlertLocation : alertLocation;
  const center = useMemo(() => location ? { lat: location.lat, lon: location.lon } : null, [location]);
  const fetchAlerts = useCallback((signal: AbortSignal) => alertLocation
    ? getAllNearbyAlerts(access, alertLocation, alertRadius, 'time', signal) : Promise.resolve([]),
  [access, alertLocation, alertRadius]);
  const { state, reload, refreshing, refreshError } = usePublicData(fetchAlerts, focused && active && Boolean(center), 15000);
  const alerts = state.kind === 'ready' ? state.data : undefined;
  const zones = useMemo(() => {
    const result: RiskZone[] = [];
    for (const alert of [...(alerts ?? [])].sort((a, b) => (levelFor(b.severity)?.rank ?? -1) - (levelFor(a.severity)?.rank ?? -1))) {
      const level = levelFor(alert.severity);
      const uncertainty = alert.uncertaintyRadiusM;
      if (!level || !uncertainty || uncertainty <= 0) continue;
      for (const point of alert.approximateLocations) {
        result.push({ ...point, id: alert.id, color: level.color, radiusM: uncertainty });
      }
    }
    return result;
  }, [alerts]);
  const select = useCallback((ids: number[]) => {
    setShowInfo(false);
    setSelection(ids);
  }, []);
  const scene = useMemo(() => center ? { center, gps, radiusM: alertRadius * 1000, zones, recenter } : null,
    [center, gps, alertRadius, zones, recenter]);
  const selected = alerts?.filter(alert => selection.includes(alert.id)) ?? [];
  const closeSheet = () => { setSelection([]); setShowInfo(false); };
  const heading = alerts ? t('Nearby alerts ({count})', { count: alerts.length }) : t('Nearby alerts');

  return <Screen tab scroll={false} header={<ScreenHeader title={t('Risk map')} action={
    <IconAction icon={Info} tone="header" label={t('Map legend and privacy')} onPress={() => setShowInfo(true)} />
  } />}>
    <View style={styles.layout}>
      <AlertSearchControls onChange={() => setSelection([])} />
      {!scene && <Feedback title={t('Choose a map location')} detail={t('Use your GPS, search for an address or drop a pin.')} />}
      {scene && <>
        <View style={styles.map}>
          <RiskMapSurface fill scene={scene} onSelect={select} />
          <View style={styles.mapActions} pointerEvents="box-none">
            <Surface style={styles.controlSurface}><IconAction icon={LocateFixed} label={t('Recenter map')} onPress={() => setRecenter(value => value + 1)} /></Surface>
            <Surface style={styles.controlSurface}><IconAction icon={RefreshCw} label={t('Refresh risk map')} onPress={reload} loading={refreshing} /></Surface>
          </View>
        </View>
        <Surface style={styles.panel}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
            style={styles.panelHeader}>
            <View style={[styles.handle, { backgroundColor: colors.controlBorder }]} />
            <View style={styles.panelTitle}>
              <Text accessibilityRole="header" style={[typeScale.card, { color: colors.primaryText }]}>{heading}</Text>
              {expanded ? <ChevronDown size={20} color={colors.accent} /> : <ChevronUp size={20} color={colors.accent} />}
            </View>
          </Pressable>
          {expanded && <ScrollView nestedScrollEnabled style={styles.panelScroll}
            contentContainerStyle={styles.panelContent}>
            {state.kind === 'loading' && <Feedback title={t('Loading nearby alerts…')} kind="loading" />}
            {'message' in state && <Feedback title={t('Could not load nearby alerts')} detail={state.message} kind="error" retry={reload} />}
            {!!refreshError && <Feedback title={t('Could not refresh alerts')} detail={refreshError} kind="error" retry={reload} />}
            {alerts?.length === 0 && <SupportingText>{t('No active alerts within {radius} km.', { radius: alertRadius })}</SupportingText>}
            {!!alerts?.length && <AdvisoryList items={alerts} onSelect={select} />}
          </ScrollView>}
        </Surface>
      </>}
    </View>
    <Modal visible={focused && (showInfo || selected.length > 0)} transparent animationType="slide" onRequestClose={closeSheet}>
      <View style={styles.backdrop}>
        <SafeAreaView edges={['left', 'right', 'bottom']} accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.panelTitle}>
            <Text accessibilityRole="header" style={[typeScale.section, { color: colors.primaryText }]}>
              {showInfo ? t('Map legend and privacy') : t('Wildlife warnings')}
            </Text>
            <IconAction icon={X} label={showInfo ? t('Close map information') : t('Close warning details')} onPress={closeSheet} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {showInfo ? <>
              <View style={styles.legend}>
                {Object.values(levels).map(level => <View key={level.label} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: level.color }]} />
                  <SupportingText>{t(level.label)}</SupportingText>
                </View>)}
                <View style={styles.legendItem}>
                  <View style={[styles.outline, { borderColor: colors.infoText }]} /><SupportingText>{t('Search radius')}</SupportingText>
                </View>
                {gps && <View style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: '#167ab6' }]} /><SupportingText>{t('Your GPS')}</SupportingText>
                </View>}
              </View>
              <SupportingText>{t('Colored circles show approximate report areas to protect wildlife and reporter privacy. Circle size reflects uncertainty about the location.')}</SupportingText>
            </> : selected.map(item => <Surface key={item.id}>
              <Text style={[typeScale.card, { color: colors.primaryText }]}>{advisoryTitle(item.title, item.speciesName)}</Text>
              <RiskPill severity={item.severity} />
              <SupportingText>{[dateTime(item.publishedAt), item.isSimulated ? t('Simulated warning') : null].filter(Boolean).join(' · ')}</SupportingText>
              {item.distanceKm !== undefined && <SupportingText>
                {item.distanceKm === 0 ? t('Under 1 km to the mapped area center') : t('About {distance} km to the mapped area center', { distance: item.distanceKm })}
              </SupportingText>}
              <AdvisoryDetails item={item} />
              {!item.advice && <SupportingText>{t('Keep your distance and follow directions from local forest officials.')}</SupportingText>}
            </Surface>)}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  layout: { flex: 1, minHeight: 0, gap: spacing.sm },
  map: { flex: 1, minHeight: 110 },
  mapActions: { position: 'absolute', right: spacing.sm, top: spacing.sm, gap: spacing.sm },
  controlSurface: { padding: 0, borderRadius: radius.input },
  panel: { maxHeight: '34%', padding: 0, gap: 0, flexShrink: 0 },
  panelHeader: { minHeight: sizing.touch, justifyContent: 'space-evenly', paddingHorizontal: spacing.md },
  panelTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  handle: { alignSelf: 'center', height: 3, width: 30, borderRadius: radius.pill },
  panelScroll: { flexGrow: 0, flexShrink: 1 },
  panelContent: { padding: spacing.sm, gap: spacing.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  outline: { width: 12, height: 12, borderWidth: 2, borderStyle: 'dashed', borderRadius: 6 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#17271E88' },
  sheet: { maxHeight: '78%', width: '100%', maxWidth: sizing.content, alignSelf: 'center', borderWidth: 1,
    borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingHorizontal: spacing.lg },
  sheetContent: { gap: spacing.md, paddingVertical: spacing.sm },
});
