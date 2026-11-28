import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { ArrowRight, Bell, Camera, Filter, Leaf, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { useCitizenNotifications } from '@/citizen-notifications';
import { AdvisoryList } from '@/components/AdvisoryList';
import { AlertSearchControls } from '@/components/AlertSearchControls';
import { SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { ReportRow } from '@/components/ReportRow';
import { ReportStats } from '@/components/ReportStats';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { Surface } from '@/components/Surface';
import { TextAction } from '@/components/TextAction';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { reportStatuses } from '@/report-status';
import { getAllNearbyAlerts, getCitizenReports } from '@/services/api';
import { type AlertSort } from '@/services/nearby-alerts';
import { recoverCitizenSubmissions } from '@/services/report-storage';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';

const sortOptions = [{ id: 'time', label: 'Time' }, { id: 'risk', label: 'Risk' }, { id: 'distance', label: 'Distance' }] as const;
const pageSize = 20;

export default function HomeScreen() {
  const { profile, access, alertLocation, alertRadius } = useCitizen();
  const { inbox } = useCitizenNotifications();
  const { colors } = useTheme();
  const [sort, setSort] = useState<AlertSort>('time');
  const [showSort, setShowSort] = useState(false);
  const [showActive, setShowActive] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [offset, setOffset] = useState(0);
  const focused = useIsFocused();
  const active = useAppActive();
  const enabled = focused && active;
  const fetchReports = useCallback((signal: AbortSignal) => getCitizenReports(access, signal), [access]);
  const fetchAlerts = useCallback((signal: AbortSignal) => alertLocation
    ? getAllNearbyAlerts(access, alertLocation, alertRadius, sort, signal) : Promise.resolve([]),
  [access, alertLocation, alertRadius, sort]);
  const reports = usePublicData(fetchReports, enabled, 10000);
  const alerts = usePublicData(fetchAlerts, enabled && Boolean(alertLocation), 15000);
  const reportReload = reports.revalidate;
  const citizenId = profile?.id;
  const unread = inbox?.unread ?? 0;
  const items = alerts.state.kind === 'ready' && alertLocation ? alerts.state.data : undefined;
  const count = items?.length;
  const pageOffset = count ? Math.min(offset, Math.floor((count - 1) / pageSize) * pageSize) : 0;

  useEffect(() => setOffset(0), [alertLocation, alertRadius]);

  useFocusEffect(useCallback(() => {
    if (!citizenId || !active) return;
    const controller = new AbortController();
    void recoverCitizenSubmissions(access, citizenId, controller.signal)
      .then((recovered) => { if (recovered) return reportReload(controller.signal); }).catch(() => {});
    return () => controller.abort();
  }, [access, active, citizenId, reportReload]));

  const activeReports = reports.state.kind === 'ready' ? reports.state.data.filter(({ status }) => {
    const { group } = reportStatuses[status];
    return group === 'pending' || group === 'under_work';
  }) : [];

  async function refreshHome() {
    setPulling(true);
    try { await Promise.all([reports.reload(), alerts.reload()]); }
    finally { setPulling(false); }
  }

  const openMap = () => router.navigate('/(tabs)/risk-map');
  const header = <ScreenHeader action={<View>
    <IconAction icon={Bell} tone="header" label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={() => router.push('/notifications')} />
    {unread > 0 && <View pointerEvents="none" accessible={false} style={[styles.badge, { backgroundColor: colors.warningTint }]}>
      <Text style={[typeScale.supporting, styles.badgeText, { color: colors.warningText }]}>{unread > 99 ? '99+' : unread}</Text>
    </View>}
  </View>} />;

  return <Screen tab header={header} refresh={{ onRefresh: () => void refreshHome(), refreshing: pulling }}>
    <View style={styles.home}>
      <AlertSearchControls onChange={() => setOffset(0)} />
      {alertLocation && alerts.state.kind === 'loading' && <Surface style={styles.warningLoading}>
        <Feedback title="Checking nearby warnings…" kind="loading" />
      </Surface>}
      {count !== undefined && <Pressable accessibilityRole="button" onPress={openMap}
        style={({ pressed }) => [styles.banner, { backgroundColor: count > 0 ? colors.warningTint : colors.card,
          borderColor: count > 0 ? colors.warning : colors.border, opacity: pressed ? 0.85 : 1 }]}>
        <TriangleAlert size={25} color={count > 0 ? colors.warningText : colors.mutedText} />
        <View style={styles.bannerText}>
          <Text style={[typeScale.section, { color: count > 0 ? colors.warningText : colors.primaryText }]}>
            {count > 0 ? `${count} active ${count === 1 ? 'warning' : 'warnings'}` : 'No active warnings'}
          </Text>
          <SupportingText>Within {alertRadius} km of the selected location</SupportingText>
        </View>
        <ArrowRight size={18} color={count > 0 ? colors.warningText : colors.accent} />
      </Pressable>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/report')}
        style={({ pressed }) => [styles.banner, { backgroundColor: colors.primaryAction, opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.actionIcon, { backgroundColor: colors.softAccent }]}><Camera size={22} color={colors.accent} /></View>
        <View style={styles.bannerText}>
          <Text style={[typeScale.section, { color: colors.onAction }]}>Report a sighting</Text>
          <Text style={[typeScale.supporting, { color: colors.onAction }]}>Photo, location and details</Text>
        </View>
        <ArrowRight size={20} color={colors.onAction} />
      </Pressable>
      <View style={styles.section}>
        <SectionTitle title="My reports" trailing={<TextAction label="View all" onPress={() => router.push('/all-reports')} />} />
        {reports.state.kind === 'loading' && <Feedback title="Loading reports…" kind="loading" />}
        {'message' in reports.state && <Feedback title="Could not load reports" detail={reports.state.message} kind="error" retry={reports.reload} />}
        {!!reports.refreshError && <SupportingText error>{reports.refreshError}</SupportingText>}
        {reports.state.kind === 'ready' && <ReportStats reports={reports.state.data} />}
      </View>
      <View style={styles.section}>
        <SectionTitle title="Nearby alerts" trailing={<View style={styles.controls}>
          {alertLocation && <>
            <IconAction icon={Filter} label={showSort ? 'Hide alert sorting' : 'Sort nearby alerts'} onPress={() => setShowSort(value => !value)} />
            <IconAction icon={RefreshCw} label="Refresh nearby alerts" loading={alerts.refreshing} onPress={alerts.reload} />
          </>}
          <TextAction label="View map" onPress={openMap} />
        </View>} />
        {alertLocation ? <>
          {showSort && <SegmentedControl compact label="Sort nearby alerts" options={sortOptions} value={sort}
            onChange={value => { setSort(value); setOffset(0); }} />}
          {alerts.state.kind === 'loading' && <Feedback title="Loading alerts…" kind="loading" />}
          {'message' in alerts.state && <Feedback title="Could not load nearby alerts" detail={alerts.state.message} kind="error" retry={alerts.reload} />}
          {!!alerts.refreshError && <SupportingText error>{alerts.refreshError}</SupportingText>}
          {items && (items.length > 0 ? <AdvisoryList items={items.slice(pageOffset, pageOffset + pageSize)} />
            : <SupportingText>Keep your distance if you encounter wildlife.</SupportingText>)}
          {items && items.length > pageSize && <View style={styles.pagination}>
            {pageOffset > 0 && <TextAction label="Previous alerts" onPress={() => setOffset(pageOffset - pageSize)} />}
            {pageOffset + pageSize < items.length && <TextAction label="More alerts" onPress={() => setOffset(pageOffset + pageSize)} />}
          </View>}
        </> : <SupportingText>Choose a location to see nearby alerts.</SupportingText>}
      </View>
      {activeReports.length > 0 && <View style={styles.section}>
        <View style={styles.activeAction}>
          <TextAction label={showActive ? 'Hide active reports' : 'Show active reports'} onPress={() => setShowActive(value => !value)} />
        </View>
        {showActive && activeReports.map(report => <ReportRow key={report.reference_code} report={report} />)}
      </View>}
      <Surface style={{ backgroundColor: colors.softAccent }}>
        <View style={styles.tipTitle}><Leaf size={19} color={colors.accent} /><SectionTitle title="Wildlife safety tip" /></View>
        <SupportingText>Give wildlife room to move. Keep your distance and leave its escape route clear.</SupportingText>
        <TextAction label="Safety guidelines" onPress={() => router.push('/guidelines')} />
      </Surface>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  home: { gap: spacing.md },
  section: { gap: spacing.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: 'transparent' },
  bannerText: { flex: 1, minWidth: 0 },
  warningLoading: { minHeight: 72, justifyContent: 'center' },
  actionIcon: { width: sizing.touch, height: sizing.touch, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center' },
  activeAction: { alignItems: 'flex-start' },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  badge: { position: 'absolute', top: 2, right: 0, borderRadius: radius.pill, paddingHorizontal: spacing.xs, minWidth: 18 },
  badgeText: { textAlign: 'center', fontSize: 11 },
  tipTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
