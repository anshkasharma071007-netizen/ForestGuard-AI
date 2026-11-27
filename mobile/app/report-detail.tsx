import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { eventLabels } from '@/citizen-notifications';
import type { OriginalPhoto } from '@/components/EvidenceImage';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { PhotoPreview } from '@/components/PhotoPreview';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ReferenceCode } from '@/components/ReferenceCode';
import { ReportStatusText } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { formatTimestamp } from '@/format';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenEvidence, getCitizenReport } from '@/services/api';
import { cacheEvidence } from '@/services/evidence-cache';
import { radius, spacing, typeScale, useTheme } from '@/theme';

export default function ReportDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { access } = useCitizen();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const active = useAppActive();
  const fetchReport = useCallback((signal: AbortSignal) => getCitizenReport(access, code, signal), [access, code]);
  const { state, reload, refreshing, refreshError } = usePublicData(fetchReport, focused && active && !!code, 10000);
  const report = state.kind === 'ready' ? state.data : null;
  const point = report?.coordinates;
  const location = report?.village ?? (point && `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`);
  const source = report?.locationSource ?? (point ? 'gps' : report?.village ? 'village' : undefined);
  const risk = report?.risk;
  const hasResponse = report && (report.confirmedSpecies || risk || report.reviewNote || report.resolutionNote);

  return (
    <Screen>
      <ScreenHeader title="Report details" back action={code && <IconAction icon={RefreshCw} label="Refresh report details"
        loading={refreshing} onPress={reload} />} />
      {!code ? <Feedback title="Report unavailable" /> : state.kind === 'loading' && <Feedback title="Loading report…" kind="loading" />}
      {'message' in state && <Feedback title="Could not load report" detail={state.message} kind="error" retry={reload} />}
      {!!refreshError && <SupportingText error>{refreshError}</SupportingText>}
      {report && (
        <View style={styles.report}>
          <View style={styles.identity}>
            <ReferenceCode key={report.reference_code} code={report.reference_code} />
            <ReportStatusText status={report.status} />
          </View>
          <Text accessibilityRole="header" style={[typeScale.screen, { color: colors.primaryText }]}>{report.title}</Text>
          <SupportingText>{formatTimestamp(report.createdAt)}</SupportingText>
          {!!report.rejectionReason && <View style={[styles.rejection, { borderColor: colors.clay, backgroundColor: colors.dangerTint }]}>
            <Field label="Rejection reason" value={report.rejectionReason} />
          </View>}
          <Section title="Your submission">
            <View style={styles.fields}>
              <Field label="Category" value={report.category === 'conflict' ? 'Conflict' : 'Sighting'} />
              <Field label="Reported animal" value={report.species} />
              <Field label="Incident location" value={location} />
              <Field label="Location source" value={source === 'gps' ? 'GPS' : source === 'village' ? 'Village selection' : undefined} />
            </View>
            <Field label="Description" value={report.description} />
            {focused && report.hasPhoto && <IncidentPhoto key={report.reference_code} code={report.reference_code} />}
          </Section>
          {!!hasResponse && <Section title="Authority response">
            <View style={styles.fields}>
              <Field label="Confirmed animal" value={report.confirmedSpecies} />
              <Field label="Risk" value={risk && (risk[0].toUpperCase() + risk.slice(1))}
                color={risk === 'high' ? colors.clay : risk === 'moderate' ? colors.warningText : colors.successText} />
            </View>
            <Field label="Review note" value={report.reviewNote} />
            <Field label="Resolution" value={report.resolutionNote} />
          </Section>}
          {report.events.length > 0 && <Section title="Activity">
            {report.events.map(({ event, at }) => <View key={event + at} style={styles.activity}>
              <Text style={[typeScale.body, { color: colors.primaryText }]}>{eventLabels[event] ?? 'Report updated'}</Text>
              <SupportingText>{formatTimestamp(at)}</SupportingText>
            </View>)}
          </Section>}
        </View>
      )}
    </Screen>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const { colors } = useTheme();
  return <View style={[styles.section, { borderColor: colors.border }]}>
    <SectionTitle title={title} />
    {children}
  </View>;
}

function Field({ label, value, color }: { label: string; value?: string; color?: string }) {
  const { colors } = useTheme();
  if (!value) return null;
  return <View style={styles.field}>
    <SupportingText>{label}</SupportingText>
    <Text style={[typeScale.body, { color: color ?? colors.primaryText }]}>{value}</Text>
  </View>;
}

function IncidentPhoto({ code }: { code: string }) {
  const { access } = useCitizen();
  const [imageError, setImageError] = useState(false);
  const [photo, setPhoto] = useState<OriginalPhoto>();
  const [viewing, setViewing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (access.signal.aborted) return;
    let release: (() => void) | undefined;
    const cancel = () => {
      controller.abort();
      release?.();
      release = undefined;
    };
    const failed = () => { if (!controller.signal.aborted) setImageError(true); };
    const load = (uri: string) => Image.getSize(uri, (width, height) => {
      if (!controller.signal.aborted) setPhoto({ uri, width, height });
    }, failed);

    access.signal.addEventListener('abort', cancel, { once: true });
    void getCitizenEvidence(access, code, controller.signal).then(async (evidence) => {
      if (controller.signal.aborted) return;
      if (evidence.blob) {
        const uri = URL.createObjectURL(evidence.blob);
        release = () => URL.revokeObjectURL(uri);
        load(uri);
        return;
      }
      // Decode a temporary app-private file without copying evidence through Blob and base64.
      const file = await cacheEvidence(evidence.bytes);
      release = file.release;
      if (controller.signal.aborted) {
        cancel();
        return;
      }
      load(file.uri);
    }).catch(failed);
    return () => {
      access.signal.removeEventListener('abort', cancel);
      cancel();
    };
  }, [access, code, attempt]);

  if (imageError) return <Feedback title="Could not load photograph" kind="error" retry={() => {
    setImageError(false);
    setAttempt(attempt + 1);
  }} />;
  if (!photo) return <SupportingText>Loading photograph…</SupportingText>;
  return <>
    <PhotoPreview photo={photo} onExpand={() => setViewing(true)} />
    {viewing && <PhotoViewer photo={photo} onClose={() => setViewing(false)} />}
  </>;
}

const styles = StyleSheet.create({
  report: { gap: spacing.md },
  identity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.sm },
  section: { borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg, gap: spacing.md },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { flexBasis: '46%', flexGrow: 1, minWidth: 128, gap: spacing.xs },
  activity: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  rejection: { padding: spacing.md, borderLeftWidth: 3, borderRadius: radius.input },
});
