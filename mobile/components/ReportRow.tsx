import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTimestamp } from '@/format';
import type { CitizenReport, ReportStatus } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';
import { StatusPill } from './Feedback';

const statuses = {
  pending: { label: 'Pending', tone: 'warning' },
  forwarded: { label: 'Pending', tone: 'warning' },
  verified: { label: 'Under Work', tone: 'success' },
  under_work: { label: 'Under Work', tone: 'success' },
  resolved: { label: 'Resolved', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  closed: { label: 'Resolved', tone: 'neutral' },
} as const satisfies Record<ReportStatus, { label: string; tone: string }>;

export function ReportStatusPill({ status }: { status: ReportStatus }) {
  return <StatusPill {...statuses[status]} />;
}

export function ReportStatusText({ status }: { status: ReportStatus }) {
  const { colors } = useTheme();
  const { label } = statuses[status];
  const color = { Pending: colors.warningText, 'Under Work': colors.infoText,
    Rejected: colors.clay, Resolved: colors.successText }[label];
  return <Text style={[typeScale.supporting, { color }]}>{label}</Text>;
}

export function ReportRow({ report, showReference = false }: { report: CitizenReport; showReference?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" onPress={() => router.push({
    pathname: '/report-detail', params: { code: report.reference_code },
  })} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: pressed ? colors.successTint : colors.card }]}>
    <View style={styles.line}>
      <Text style={[typeScale.card, styles.title, { color: colors.primaryText }]}>{report.title}</Text>
      <ChevronRight size={16} color={colors.mutedText} />
    </View>
    {showReference && <Text style={[typeScale.supporting, { color: colors.mutedText }]}>{report.reference_code}</Text>}
    <View style={styles.line}>
      <ReportStatusText status={report.status} />
      <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{formatTimestamp(report.createdAt)}</Text>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radius.input, padding: spacing.md, gap: spacing.xs },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1 },
});
