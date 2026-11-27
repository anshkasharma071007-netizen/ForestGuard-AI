import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Bell, ChevronDown, Filter, MapPin, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { useCitizenNotifications } from '@/citizen-notifications';
import { AdvisoryList } from '@/components/AdvisoryList';
import { AlertSearchControls } from '@/components/AlertSearchControls';
import { SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReportRow } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { TextAction } from '@/components/TextAction';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenReports, getNearbyAlerts } from '@/services/api';
import { type AlertSort } from '@/services/nearby-alerts';
import { recoverCitizenSubmissions } from '@/services/report-storage';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';

const sortOptions = [{ id: 'time', label: 'Time' }, { id: 'risk', label: 'Risk' }, { id: 'distance', label: 'Distance' }] as const;

export default function HomeScreen() {
  const { profile, access, alertLocation, alertRadius } = useCitizen();
  const { inbox } = useCitizenNotifications();
  const { colors } = useTheme();
  const [sort, setSort] = useState<AlertSort>('time');
  const [showSort, setShowSort] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [offset, setOffset] = useState(0);
  const focused = useIsFocused();
  const active = useAppActive();
  const enabled = focused && active;
  const location = profile?.savedAlertLocation;
  const fetchReports = useCallback((signal: AbortSignal) => getCitizenReports(access, signal), [access]);
  const fetchAlerts = useCallback((signal: AbortSignal) =>
    alertLocation ? getNearbyAlerts(access, alertLocation, alertRadius, sort, offset, signal)
      : Promise.resolve({ items: [], nextOffset: null }),
    [access, alertLocation, alertRadius, sort, offset]);
  const reports = usePublicData(fetchReports, enabled, 10000);
  const alerts = usePublicData(fetchAlerts, enabled && Boolean(alertLocation), 15000);
  const reportReload = reports.revalidate;
  const citizenId = profile?.id;
  const unread = inbox?.unread ?? 0;

  useEffect(() => setOffset(0), [alertLocation, alertRadius]);

  useFocusEffect(useCallback(() => {
    if (!citizenId || !active) return;
    const controller = new AbortController();
    void recoverCitizenSubmissions(access, citizenId, controller.signal)
      .then((recovered) => { if (recovered) return reportReload(controller.signal); }).catch(() => {});
    return () => controller.abort();
  }, [access, active, citizenId, reportReload]));

  const activeReports = reports.state.kind === 'ready' ? reports.state.data.filter(
    ({ status }) => status === 'pending' || status === 'forwarded' || status === 'under_work' || status === 'verified',
  ) : [];

  async function refreshHome() {
    setPulling(true);
    await Promise.all([reports.reload(), alerts.reload()]);
    setPulling(false);
  }

  return (
    <Screen tab refresh={{ onRefresh: () => void refreshHome(), refreshing: pulling }}>
      <ScreenHeader action={<View>
        <IconAction icon={Bell} label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          onPress={() => router.push('/notifications')} />
        {unread > 0 && <View pointerEvents="none" accessible={false} style={[styles.badge, { backgroundColor: colors.lime }]}>
          <Text style={[typeScale.supporting, styles.badgeText, { color: colors.deepForest }]}>{unread > 99 ? '99+' : unread}</Text>
        </View>}
      </View>} />
      <View style={styles.home}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change saved location" style={styles.location}
          onPress={() => router.push('/profile')}>
          <MapPin size={16} color={colors.accent} />
          <Text style={[typeScale.supporting, { color: colors.primaryText, flexShrink: 1 }]}>
            {location?.type === 'village' ? [location.village.name, location.village.district].filter(Boolean).join(', ') : location ? 'Saved GPS location' : 'Manage saved location'}
          </Text>
          <ChevronDown size={14} color={colors.mutedText} />
        </Pressable>
        <PrimaryButton label="New report" icon="plus" onPress={() => router.push('/report')} />
        <View style={styles.section}>
          <SectionTitle title="My active reports" trailing={<IconAction icon={RefreshCw} label="Refresh active reports"
            loading={reports.refreshing} onPress={reports.reload} />} />
          {reports.state.kind === 'loading' && <Feedback title="Loading reports…" kind="loading" />}
          {'message' in reports.state && <Feedback title="Could not load reports" detail={reports.state.message} kind="error" retry={reports.reload} />}
          {!!reports.refreshError && <SupportingText error>{reports.refreshError}</SupportingText>}
          {reports.state.kind === 'ready' && (activeReports.length
            ? activeReports.map((report) => <ReportRow key={report.reference_code} report={report} />)
            : <SupportingText>No active reports</SupportingText>)}
          <View style={styles.link}><TextAction label="All reports" onPress={() => router.push('/all-reports')} /></View>
        </View>
        <View style={[styles.section, styles.divider, { borderColor: colors.border }]}>
          <SectionTitle title="Nearby alerts" trailing={<View style={styles.controls}>
            <IconAction icon={Filter} label={showSort ? 'Hide alert sorting' : 'Sort nearby alerts'} onPress={() => setShowSort(!showSort)} />
            <IconAction icon={RefreshCw} label="Refresh nearby alerts" loading={alerts.refreshing} onPress={alerts.reload} />
          </View>} />
          <AlertSearchControls onChange={() => setOffset(0)} />
          {showSort && <SegmentedControl label="Sort nearby alerts" options={sortOptions} value={sort}
            onChange={value => { setSort(value); setOffset(0); }} />}
          {!!alerts.refreshError && <SupportingText error>{alerts.refreshError}</SupportingText>}
          {alertLocation ? <AdvisoryList state={alerts.state} retry={alerts.reload} radiusKm={alertRadius} />
            : <SupportingText>Choose a location to search for nearby alerts.</SupportingText>}
          {(offset > 0 || (alerts.state.kind === 'ready' && alerts.state.data.nextOffset !== null)) && <View style={styles.controls}>
            {offset > 0 && <TextAction label="Previous alerts" onPress={() => setOffset(Math.max(0, offset - 20))} />}
            {alerts.state.kind === 'ready' && alerts.state.data.nextOffset !== null &&
              <TextAction label="More alerts" onPress={() => {
                if (alerts.state.kind === 'ready' && alerts.state.data.nextOffset !== null) setOffset(alerts.state.data.nextOffset);
              }} />}
          </View>}
        </View>
        <View style={styles.link}><TextAction label="Safety guidelines" onPress={() => router.push('/guidelines')} /></View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  home: { gap: spacing.md },
  section: { gap: spacing.sm },
  divider: { borderTopWidth: 1, paddingTop: spacing.sm },
  location: { minHeight: sizing.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -spacing.lg },
  link: { alignItems: 'flex-end' },
  controls: { flexDirection: 'row' },
  badge: { position: 'absolute', top: spacing.xs, right: 0, borderRadius: radius.pill, paddingHorizontal: spacing.xs, minWidth: 18 },
  badgeText: { textAlign: 'center', fontSize: 11 },
});
