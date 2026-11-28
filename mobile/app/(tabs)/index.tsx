import { useLanguage } from '@/i18n';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Bell, Camera, Filter, Leaf, PawPrint, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { useCitizenNotifications } from '@/citizen-notifications';
import { AdvisoryList } from '@/components/AdvisoryList';
import { AlertSearchControls } from '@/components/AlertSearchControls';
import { SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { PressableScale } from '@/components/PressableScale';
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
import { elevation, radius, sizing, spacing, typeScale, useTheme } from '@/theme';

const sortOptions = [{ id: 'time', label: 'Time' }, { id: 'risk', label: 'Risk' }, { id: 'distance', label: 'Distance' }] as const;
const pageSize = 20;

export default function HomeScreen() {
  const { t, errorText } = useLanguage();
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
    <IconAction icon={Bell} tone="header" label={unread ? t('Notifications, {count} unread', { count: unread }) : t('Notifications')}
      onPress={() => router.push('/notifications')} />
    {unread > 0 && <View pointerEvents="none" accessible={false} style={[styles.badge, { backgroundColor: colors.warningTint }]}>
      <Text style={[typeScale.supporting, styles.badgeText, { color: colors.warningText }]}>{unread > 99 ? '99+' : unread}</Text>
    </View>}
  </View>} />;

  return <Screen tab header={header} refresh={{ onRefresh: () => void refreshHome(), refreshing: pulling }}>
    <View style={styles.home}>
      <AlertSearchControls onChange={() => setOffset(0)} />
      {alertLocation && alerts.state.kind === 'loading' && <Surface style={styles.warningLoading}>
        <Feedback title={t('Checking nearby warnings…')} kind="loading" />
      </Surface>}
      {count !== undefined && <PressableScale onPress={openMap} haptic="light"
        style={[styles.banner, elevation.subtle, { backgroundColor: count > 0 ? colors.warningTint : colors.card,
          borderColor: count > 0 ? colors.warning : colors.border }]}
        pressedStyle={{ borderColor: count > 0 ? colors.warning : colors.focus }}>
        <View style={[styles.bannerIcon, { backgroundColor: count > 0 ? colors.warning : colors.softAccent }]}>
          <TriangleAlert size={22} color={count > 0 ? colors.onLime : colors.accent} />
        </View>
        <View style={styles.bannerText}>
          <Text style={[typeScale.section, { color: count > 0 ? colors.warningText : colors.primaryText }]}>
            {count > 0 ? t(count === 1 ? '{count} active warning' : '{count} active warnings', { count }) : t('No active warnings')}
          </Text>
          <SupportingText>{t('Within {radius} km of the selected location', { radius: alertRadius })}</SupportingText>
        </View>
        <ArrowRight size={18} color={count > 0 ? colors.warningText : colors.accent} />
      </PressableScale>}
      <PressableScale onPress={() => router.push('/report')} haptic="medium"
        containerStyle={[elevation.card, { borderRadius: radius.card, backgroundColor: colors.actionFrom }]}
        style={[styles.banner, styles.reportBanner]} pressedStyle={{ opacity: 0.92 }}>
        <LinearGradient colors={[colors.actionFrom, colors.actionTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.pawA}><PawPrint size={70} color={colors.lime} /></View>
        <View pointerEvents="none" style={styles.pawB}><PawPrint size={40} color={colors.lime} /></View>
        <View style={[styles.actionIcon, { backgroundColor: colors.lime }]}><Camera size={22} color={colors.onLime} /></View>
        <View style={styles.bannerText}>
          <Text style={[typeScale.section, { color: colors.onAction }]}>{t('Report a sighting')}</Text>
          <Text style={[typeScale.supporting, { color: 'rgba(246,251,238,0.82)' }]}>{t('Photo, location and details')}</Text>
        </View>
        <ArrowRight size={20} color={colors.lime} />
      </PressableScale>
      <View style={styles.section}>
        <SectionTitle title={t('My reports')} trailing={<TextAction label={t('View all')} onPress={() => router.push('/all-reports')} />} />
        {reports.state.kind === 'loading' && <Feedback title={t('Loading reports…')} kind="loading" />}
        {'message' in reports.state && <Feedback title={t('Could not load reports')} detail={reports.state.message} kind="error" retry={reports.reload} />}
        {!!reports.refreshError && <SupportingText error>{errorText(reports.refreshError)}</SupportingText>}
        {reports.state.kind === 'ready' && <ReportStats reports={reports.state.data} />}
      </View>
      <View style={styles.section}>
        <SectionTitle title={t('Nearby alerts')} trailing={<View style={styles.controls}>
          {alertLocation && <>
            <IconAction icon={Filter} label={showSort ? t('Hide alert sorting') : t('Sort nearby alerts')} onPress={() => setShowSort(value => !value)} />
            <IconAction icon={RefreshCw} label={t('Refresh nearby alerts')} loading={alerts.refreshing} onPress={alerts.reload} />
          </>}
          <TextAction label={t('View map')} onPress={openMap} />
        </View>} />
        {alertLocation ? <>
          {showSort && <SegmentedControl compact label={t('Sort nearby alerts')} options={sortOptions.map(option => ({ ...option, label: t(option.label) }))} value={sort}
            onChange={value => { setSort(value); setOffset(0); }} />}
          {alerts.state.kind === 'loading' && <Feedback title={t('Loading alerts…')} kind="loading" />}
          {'message' in alerts.state && <Feedback title={t('Could not load nearby alerts')} detail={alerts.state.message} kind="error" retry={alerts.reload} />}
          {!!alerts.refreshError && <SupportingText error>{errorText(alerts.refreshError)}</SupportingText>}
          {items && (items.length > 0 ? <AdvisoryList items={items.slice(pageOffset, pageOffset + pageSize)} />
            : <SupportingText>{t('Keep your distance if you encounter wildlife.')}</SupportingText>)}
          {items && items.length > pageSize && <View style={styles.pagination}>
            {pageOffset > 0 && <TextAction label={t('Previous alerts')} onPress={() => setOffset(pageOffset - pageSize)} />}
            {pageOffset + pageSize < items.length && <TextAction label={t('More alerts')} onPress={() => setOffset(pageOffset + pageSize)} />}
          </View>}
        </> : <SupportingText>{t('Choose a location to see nearby alerts.')}</SupportingText>}
      </View>
      {activeReports.length > 0 && <View style={styles.section}>
        <View style={styles.activeAction}>
          <TextAction label={showActive ? t('Hide active reports') : t('Show active reports')} onPress={() => setShowActive(value => !value)} />
        </View>
        {showActive && activeReports.map(report => <ReportRow key={report.reference_code} report={report} />)}
      </View>}
      <Surface style={{ backgroundColor: colors.softAccent }}>
        <View style={styles.tipTitle}><Leaf size={19} color={colors.accent} /><SectionTitle title={t('Wildlife safety tip')} /></View>
        <SupportingText>{t('Give wildlife room to move. Keep your distance and leave its escape route clear.')}</SupportingText>
        <TextAction label={t('Safety guidelines')} onPress={() => router.push('/guidelines')} />
      </Surface>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  home: { gap: spacing.md },
  section: { gap: spacing.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: 'transparent' },
  reportBanner: { overflow: 'hidden', borderColor: 'transparent' },
  bannerIcon: { width: 44, height: 44, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  pawA: { position: 'absolute', right: 64, top: -8, opacity: 0.14, transform: [{ rotate: '-16deg' }] },
  pawB: { position: 'absolute', right: 14, bottom: -12, opacity: 0.1, transform: [{ rotate: '12deg' }] },
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
