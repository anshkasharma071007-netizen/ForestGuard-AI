import { useFocusEffect } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationRow } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { FindReport } from '@/components/FindReport';
import { ReportRow } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { getReportStatus } from '@/services/api';
import { checkedReport, recoverSubmissions, loadStoredReports, saveStoredReports, type StoredReport } from '@/services/report-storage';
import { spacing } from '@/theme';

export default function ReportsScreen() {
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lookup, setLookup] = useState(false);
  const refreshInProgress = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    setRefreshing(true);
    setRefreshError('');
    const updated: StoredReport[] = [];
    const failures: string[] = [];
    try {
      const saved = await loadStoredReports();
      setReports(saved);
      setLoading(false);
      await recoverSubmissions();
      const reports = await loadStoredReports();
      setReports(reports);
      setLoadError('');
      // Limit requests in flight and retain offline status for each failed reference.
      let cursor = 0;
      async function checkNext() {
        while (cursor < reports.length) {
          const report = reports[cursor++];
          try {
            updated.push(checkedReport(await getReportStatus(report.referenceCode), report));
          } catch (error) {
            failures.push(error instanceof Error ? error.message : 'Could not load the report status.');
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, reports.length) }, checkNext));
      if (updated.length) {
        let storageWarning = '';
        try { await saveStoredReports(updated); }
        catch { storageWarning = 'Updated statuses could not be saved on this device.'; }

        const byCode = new Map(updated.map((report) => [report.referenceCode, report]));
        setReports((current) => current.map((report) => byCode.get(report.referenceCode) ?? report));
        if (storageWarning) failures.push(storageWarning);
      }
      setRefreshError([...new Set(failures)].join(' '));
    } catch {
      setLoadError('Saved reports could not be loaded.');
    } finally {
      setLoading(false);
      refreshInProgress.current = false;
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]));

  const sorted = [...reports].sort((a, b) => Date.parse(b.createdAt ?? b.submittedAt) - Date.parse(a.createdAt ?? a.submittedAt));

  return (
    <Screen>
      <ScreenHeader title="Older report references" back />
      <View style={styles.content}>
        <View>
          <SectionTitle title="Saved references" action={reports.length ? {
            label: refreshing ? 'Refreshing…' : 'Refresh',
            loading: refreshing,
            disabled: loading,
            onPress: () => void refresh(),
          } : undefined} />
          {loading && <Feedback title="Loading saved reports…" kind="loading" />}
          {!!loadError && <Feedback title={loadError} kind="error" retry={refresh} />}
          {!!refreshError && <SupportingText error>{refreshError}</SupportingText>}
          {!loading && !loadError && reports.length === 0 &&
            <Feedback title="No saved reports" detail="Reports you submit or find are saved on this device." />}
          {sorted.map((report) => <ReportRow key={report.referenceCode} report={report} />)}
        </View>
        <NavigationRow label="Find a report" icon={Search} disabled={refreshing || loading} onPress={() => setLookup(true)} />
      </View>
      {lookup && <FindReport savedReports={reports} onClose={() => setLookup(false)}
        onSaved={(report) => setReports((current) => [report, ...current.filter((item) => item.referenceCode !== report.referenceCode)].slice(0, 50))} />}
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.lg } });
