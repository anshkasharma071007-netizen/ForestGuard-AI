import { useLanguage } from '@/i18n';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import type { CitizenReport, ReportStatus } from '@/services/api';
import { elevation, radius, spacing, typeScale, useTheme } from '@/theme';
import { reportStatuses } from '@/report-status';
import { StatusPill } from './Feedback';
import { PressableScale } from './PressableScale';

export function ReportStatusPill({ status }: { status: ReportStatus }) {
  const { t } = useLanguage();
  const { label, tone } = reportStatuses[status];
  return <StatusPill label={t(label)} tone={tone} />;
}

export function ReportRow({ report, showReference = false }: { report: CitizenReport; showReference?: boolean }) {
  const { dateTime } = useLanguage();
  const { colors } = useTheme();
  return <PressableScale haptic="selection" onPress={() => router.push({
    pathname: '/report-detail', params: { code: report.reference_code },
  })} style={[styles.row, elevation.subtle, { borderColor: colors.border, backgroundColor: colors.card }]}
    pressedStyle={{ borderColor: colors.focus }}>
    <View style={styles.line}>
      <Text style={[typeScale.card, styles.title, { color: colors.primaryText }]}>{report.title}</Text>
      <View style={[styles.chevron, { backgroundColor: colors.background }]}><ChevronRight size={15} color={colors.accent} /></View>
    </View>
    {showReference && <Text style={[typeScale.supporting, { color: colors.mutedText }]}>{report.reference_code}</Text>}
    <View style={styles.line}>
      <ReportStatusPill status={report.status} />
      <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{dateTime(report.createdAt)}</Text>
    </View>
  </PressableScale>;
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radius.input, padding: spacing.md, gap: spacing.xs },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1 },
  chevron: { width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
