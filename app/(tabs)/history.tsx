import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { TextAction } from '@/components/TextAction';
import { getReportStatus, isApiConfigured } from '@/services/api';
import { loadStoredReports, saveStoredReport, type StoredReport } from '@/services/report-storage';
import { radius, sizing, spacing, typography, typeScale, useTheme } from '@/theme';

export default function ReportsScreen() {
  const { colors } = useTheme();
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [busyReference, setBusyReference] = useState<string | null>(null);
  const requestInProgress = useRef(false);
  const loadVersion = useRef(0);

  const loadReports = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError('');
    try {
      const records = await loadStoredReports();
      if (version === loadVersion.current) setReports(records);
    } catch {
      if (version === loadVersion.current) setLoadError('Saved reports could not be loaded.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadReports();
  }, [loadReports]));

  async function checkStatus(report?: StoredReport) {
    if (requestInProgress.current) return;
    const code = report?.referenceCode ?? reference.trim().toUpperCase();
    if (!code) { setError('Enter a reference code.'); return; }
    if (!isApiConfigured) { setError('Report status lookup is unavailable.'); return; }

    requestInProgress.current = true;
    setBusyReference(report?.referenceCode ?? '');
    setError('');
    try {
      const response = await getReportStatus(code);
      const previous = report ?? reports.find((item) => item.referenceCode === response.reference_code);
      const now = new Date().toISOString();
      const updated: StoredReport = {
        referenceCode: response.reference_code,
        status: response.status,
        submittedAt: previous?.submittedAt ?? now,
        createdAt: response.created_at ?? previous?.createdAt,
        statusCheckedAt: now,
      };
      try {
        await saveStoredReport(updated);
        await loadReports();
      } catch {
        setReports((saved) => [updated, ...saved.filter((item) => item.referenceCode !== updated.referenceCode)].slice(0, 50));
        setError('Status retrieved, but this reference could not be saved on this device.');
      }
      if (!report) setReference('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The report status could not be loaded.');
    } finally {
      requestInProgress.current = false;
      setBusyReference(null);
    }
  }

  return (
    <Screen tab>
      <ScreenHeader title="Reports" />
      <View style={styles.content}>
        <PrimaryButton label="New report" icon="plus" onPress={() => router.push('/report')} />
        <View style={styles.group}>
          <SectionTitle title="Check a report" />
          <TextInput accessibilityLabel="Reference code" value={reference} autoCapitalize="characters" autoCorrect={false}
            onChangeText={setReference} placeholder="Reference code" placeholderTextColor={colors.mutedText}
            returnKeyType="search" onSubmitEditing={() => void checkStatus()} editable={busyReference === null}
            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.controlBorder, color: colors.primaryText }]} />
          <PrimaryButton label={busyReference === '' ? 'Checking status…' : 'Check status'}
            onPress={() => void checkStatus()} loading={busyReference === ''} disabled={busyReference !== null} />
          {!isApiConfigured && <Text style={{ color: colors.secondaryText, ...typeScale.supporting }}>Report status lookup is unavailable.</Text>}
          {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.clay }}>{error}</Text>}
        </View>
        <View style={styles.group}>
          <SectionTitle title="Saved reports" />
          {loading && <ActivityIndicator accessibilityLabel="Loading saved reports" color={colors.primaryText} />}
          {!!loadError && <EmptyState title={loadError} />}
          {!!loadError && <TextAction label="Retry saved reports" onPress={loadReports} />}
          {!loading && !loadError && reports.length === 0 &&
            <EmptyState title="No saved reports" detail="Report references you submit or look up on this device appear here." />}
          {reports.map((report) => (
            <View key={report.referenceCode} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text selectable style={{ color: colors.primaryText, ...typeScale.card, fontFamily: typography.mono }}>{report.referenceCode}</Text>
              <Text style={{ color: colors.primaryText }}>Status: {report.status}</Text>
              <Text style={{ color: colors.secondaryText, ...typeScale.supporting }}>
                {report.createdAt ? 'Submitted' : 'Saved'} {formatDate(report.createdAt ?? report.submittedAt)}
              </Text>
              {report.statusCheckedAt && <Text style={{ color: colors.secondaryText, ...typeScale.supporting }}>Status checked {formatDate(report.statusCheckedAt)}</Text>}
              <TextAction label={busyReference === report.referenceCode ? 'Refreshing…' : 'Refresh status'}
                disabled={busyReference !== null} onPress={() => void checkStatus(report)} />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleString();
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  group: { gap: spacing.sm },
  input: { minHeight: sizing.touch, borderWidth: 1, borderRadius: radius.input, paddingHorizontal: spacing.md, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
});
