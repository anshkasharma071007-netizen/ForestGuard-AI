import { useLanguage } from '@/i18n';
import { router } from 'expo-router';
import { CircleCheck, Clock3, RefreshCw } from 'lucide-react-native';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { reportStatuses } from '@/report-status';
import type { CitizenReport } from '@/services/api';
import { elevation, radius, spacing, typeScale, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';

const stats = [
  { id: 'pending', icon: Clock3, ink: 'warningText', tint: 'warningTint' },
  { id: 'under_work', icon: RefreshCw, ink: 'infoText', tint: 'softAccent' },
  { id: 'resolved', icon: CircleCheck, ink: 'successText', tint: 'successTint' },
] as const;

export function ReportStats({ reports }: { reports: CitizenReport[] }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const wrap = width / Math.max(fontScale, 1) < (language === 'hi' ? 320 : 270);
  return <View style={[styles.row, wrap && styles.stack]}>
    {stats.map(({ id, icon: Icon, ink, tint }) => {
      const label = t(reportStatuses[id].label);
      const count = reports.filter(report => reportStatuses[report.status].group === id).length;
      return <PressableScale key={id} haptic="selection" containerStyle={styles.statWrap}
        accessibilityLabel={t('{count} reports, {status}', { count, status: label })}
        accessibilityHint={t('Opens report history filtered by status')}
        onPress={() => router.push({ pathname: '/all-reports', params: { status: id } })}
        style={[styles.stat, elevation.subtle, { backgroundColor: colors.card, borderColor: colors.border }]}
        pressedStyle={{ borderColor: colors.focus }}>
        <View style={[styles.chip, { backgroundColor: colors[tint] }]}><Icon size={16} color={colors[ink]} /></View>
        <Text style={[typeScale.header, { color: colors.primaryText }]}>{count}</Text>
        <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{label}</Text>
      </PressableScale>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  stack: { flexDirection: 'column' },
  statWrap: { flex: 1, minWidth: 0 },
  stat: { flex: 1, borderWidth: 1, borderRadius: radius.card, padding: spacing.sm, gap: spacing.xs },
  chip: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});