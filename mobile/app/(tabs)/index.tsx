import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { AdvisoryList } from '@/components/AdvisoryList';
import { NavigationRow, SegmentedControl } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ReportStatusPill } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenReports, getPublicAlerts } from '@/services/api';
import { nearbyAlerts, type AlertSort } from '@/services/nearby-alerts';
import { recoverCitizenSubmissions } from '@/services/report-storage';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const sortOptions = [{ id: 'time', label: 'Time' }, { id: 'risk', label: 'Risk' }, { id: 'distance', label: 'Distance' }] as const;

export default function HomeScreen() {
  const { profile, access } = useCitizen();
  const { colors } = useTheme();
  const [sort, setSort] = useState<AlertSort>('time');
  const focused = useIsFocused();
  const active = useAppActive();
  const enabled = focused && active;
  const location = profile?.location;
  const fetchReports = useCallback((signal: AbortSignal) => getCitizenReports(access, signal), [access]);
  const fetchAlerts = useCallback((signal: AbortSignal) => getPublicAlerts(signal), []);
  const reports = usePublicData(fetchReports, enabled, 10000);
  const alerts = usePublicData(fetchAlerts, enabled, 15000);
  const reportReload = reports.reload;
  const citizenId = profile?.id;

  useFocusEffect(useCallback(() => {
    if (!citizenId || !active) return;
    const controller = new AbortController();
    void recoverCitizenSubmissions(access, citizenId, controller.signal)
      .then((recovered) => { if (recovered && !controller.signal.aborted) reportReload(); }).catch(() => {});
    return () => controller.abort();
  }, [access, active, citizenId, reportReload]));

  const advisoryState = alerts.state.kind === 'ready' && location
    ? { kind: 'ready' as const, data: nearbyAlerts(alerts.state.data, location, sort) } : alerts.state;

  return (
    <Screen tab>
      <ScreenHeader />
      <ScreenHeader title="Home" />
      <View style={{ gap: spacing.lg }}>
        <PrimaryButton label="New report" icon="plus" onPress={() => router.push('/report')} />
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title="My reports" />
          {reports.state.kind === 'loading' && <Feedback title="Loading reports…" kind="loading" />}
          {'message' in reports.state && <Feedback title="Could not load reports" detail={reports.state.message} kind="error" retry={reports.reload} />}
          {reports.state.kind === 'ready' && (reports.state.data.length ? reports.state.data.map((report) => (
            <Pressable key={report.reference_code} accessibilityRole="button" onPress={() => router.push({
              pathname: '/report-detail', params: { code: report.reference_code },
            })} style={({ pressed }) => ({ gap: spacing.xs, padding: spacing.md, borderRadius: radius.card,
              backgroundColor: pressed ? colors.successTint : colors.card })}>
              <Text style={[typeScale.card, { color: colors.primaryText }]}>{report.title}</Text>
              <SupportingText>{[report.village, new Date(report.createdAt).toLocaleString()].filter(Boolean).join(' · ')}</SupportingText>
              <View style={{ alignSelf: 'flex-start' }}><ReportStatusPill status={report.status} /></View>
            </Pressable>
          )) : <Feedback title="No reports yet" detail="Reports you submit will appear here." />)}
        </View>
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title="Nearby alerts" />
          <SegmentedControl label="Sort nearby alerts" options={sortOptions} value={sort} onChange={setSort} />
          <AdvisoryList state={advisoryState} retry={alerts.reload} />
        </View>
        <NavigationRow label="Safety guidelines" icon={BookOpen} onPress={() => router.push('/guidelines')} />
      </View>
    </Screen>
  );
}
