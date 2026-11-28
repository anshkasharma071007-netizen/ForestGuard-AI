import { useLanguage } from '@/i18n';
import { router } from 'expo-router';
import { CircleCheck, Clock3, RefreshCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { reportStatuses } from '@/report-status';
import type { CitizenReport } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const stats = [
  { id: 'pending', icon: Clock3, ink: 'warningText' },
  { id: 'under_work', icon: RefreshCw, ink: 'infoText' },
  { id: 'resolved', icon: CircleCheck, ink: 'successText' },
] as const;

export function ReportStats({ reports }: { reports: CitizenReport[] }) {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const wrap = width / Math.max(fontScale, 1) < (language === 'hi' ? 320 : 270);
  return <View style={[styles.row, wrap && styles.stack]}>
    {stats.map(({ id, icon: Icon, ink }) => {
      const label = t(reportStatuses[id].label);
      const count = reports.filter(report => reportStatuses[report.status].group === id).length;
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={t('{count} reports, {status}', { count, status: label })}
        onPress={() => router.push({ pathname: '/all-reports', params: { status: id } })}
        style={({ pressed }) => [styles.stat, { backgroundColor: pressed ? colors.softAccent : colors.card, borderColor: colors.border }]}>
        <Icon size={17} color={colors[ink]} />
        <Text style={[typeScale.header, { color: colors.primaryText }]}>{count}</Text>
        <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  stack: { flexDirection: 'column' },
  stat: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: radius.input, padding: spacing.sm, gap: spacing.xs },
});
