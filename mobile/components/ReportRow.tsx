import { StyleSheet, Text, View } from 'react-native';
import type { ReportStatus } from '@/services/api';
import type { StoredReport } from '@/services/report-storage';
import { spacing, typeScale, useTheme } from '@/theme';
import { StatusPill, SupportingText } from './Feedback';

const statuses = {
  pending: { label: 'Pending', tone: 'warning' },
  forwarded: { label: 'Forwarded', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
} as const satisfies Record<ReportStatus, { label: string; tone: string }>;

export function ReportStatusPill({ status }: { status: ReportStatus }) {
  return <StatusPill {...statuses[status]} />;
}

export function ReportRow({ report }: { report: StoredReport }) {
  const { colors } = useTheme();
  const submitted = formatDate(report.createdAt);
  const saved = formatDate(report.submittedAt);
  const checked = formatDate(report.statusCheckedAt);
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.top}>
        <Text selectable style={[typeScale.card, { color: colors.primaryText }]}>{report.referenceCode}</Text>
        <ReportStatusPill status={report.status} />
      </View>
      {submitted ? <SupportingText>Submitted {submitted}</SupportingText> : saved && <SupportingText>Saved {saved}</SupportingText>}
      {checked && <SupportingText>Status checked {checked}</SupportingText>}
    </View>
  );
}

function formatDate(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : undefined;
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, paddingVertical: spacing.md, gap: spacing.xs },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
});
