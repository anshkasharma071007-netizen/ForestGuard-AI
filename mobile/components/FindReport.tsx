import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { getReportStatus, type ReportStatusResponse } from '@/services/api';
import { checkedReport, saveStoredReport, type StoredReport } from '@/services/report-storage';
import { spacing } from '@/theme';
import { InputField } from './Controls';
import { SupportingText } from './Feedback';
import { PrimaryButton } from './PrimaryButton';
import { ReportRow } from './ReportRow';
import { Screen } from './Screen';
import { ScreenHeader } from './ScreenHeader';

export function FindReport({ savedReports, onSaved, onClose }: {
  savedReports: readonly StoredReport[]; onSaved: (report: StoredReport) => void; onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ response: ReportStatusResponse; report: StoredReport }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function find() {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError('');
    setResult(undefined);
    try {
      const response = await getReportStatus(code, controller.signal);
      if (controller.signal.aborted) return;
      const report = checkedReport(response, savedReports.find(({ referenceCode }) => referenceCode === response.reference_code));
      setResult({ response, report });
      try {
        await saveStoredReport(report);
        onSaved(report);
      } catch {
        if (!controller.signal.aborted) setError('Status found, but this reference could not be saved on this device.');
      }
    } catch (source) {
      if (!controller.signal.aborted) setError(source instanceof Error ? source.message : 'Could not find this report.');
    } finally {
      inFlight.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen>
        <ScreenHeader title="Find a report" onBack={onClose} />
        <View style={styles.content}>
          <InputField label="Reference code" value={code} autoCapitalize="characters" autoCorrect={false} returnKeyType="search"
            onChangeText={setCode} onSubmitEditing={() => void find()} editable={!loading} />
          <PrimaryButton label={loading ? 'Checking status…' : 'Check status'} loading={loading} onPress={() => void find()} />
          {!!error && <SupportingText error>{error}</SupportingText>}
          {result && (
            <View style={styles.result}>
              <ReportRow report={result.report} />
              {!!result.response.species_name && <SupportingText>{result.response.species_name}</SupportingText>}
              {!!result.response.village_name && <SupportingText>{result.response.village_name}</SupportingText>}
              {!!result.response.status_note && <SupportingText>{result.response.status_note}</SupportingText>}
            </View>
          )}
        </View>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  result: { gap: spacing.xs },
});
