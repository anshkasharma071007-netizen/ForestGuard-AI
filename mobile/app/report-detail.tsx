import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { CircleCheck, CircleX, ClipboardCheck, FileCheck2, MapPin, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { eventLabels } from '@/citizen-notifications';
import type { OriginalPhoto } from '@/components/EvidenceImage';
import { Feedback, RiskPill, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { PhotoPreview } from '@/components/PhotoPreview';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ReferenceCode } from '@/components/ReferenceCode';
import { ReportStatusPill } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { Surface } from '@/components/Surface';
import { formatTimestamp } from '@/format';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenEvidence, getCitizenReport } from '@/services/api';
import { cacheEvidence } from '@/services/evidence-cache';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const activityIcons = { submitted: FileCheck2, approved: ClipboardCheck, rejected: CircleX, resolved: CircleCheck };
const analysisLabels: Record<string, string> = {
  queued: 'Photograph queued for analysis',
  processing: 'Photograph analysis in progress',
  completed: 'Photograph analysis completed',
  unavailable: 'Photograph analysis unavailable',
  failed: 'Photograph analysis could not be completed',
};

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
  const location = report?.locationLabel ?? report?.village ?? (point && `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`);
  const source = report?.locationSource ?? (point ? 'gps' : report?.village ? 'village' : undefined);
  const risk = report?.risk;
  const hasResponse = report && (report.confirmedSpecies || risk || report.reviewNote || report.resolutionNote);

  const events = [...(report?.events ?? [])].sort((first, second) => Date.parse(first.at) - Date.parse(second.at));
  const analysisLabel = report && analysisLabels[report.analysis];

  return (
    <Screen refresh={{ onRefresh: reload, refreshing }} header={
      <ScreenHeader title="Report details" back action={code && <IconAction icon={RefreshCw} tone="header"
        label="Refresh report details" loading={refreshing} onPress={reload} />} />
    }>
      {!code ? <Feedback title="Report unavailable" /> : state.kind === 'loading' && <Feedback title="Loading report…" kind="loading" />}
      {'message' in state && <Feedback title="Could not load report" detail={state.message} kind="error" retry={reload} />}
      {!!refreshError && <SupportingText error>{refreshError}</SupportingText>}
      {report && (
        <View style={styles.report}>
          {focused && report.hasPhoto && <IncidentPhoto key={report.reference_code} code={report.reference_code} />}
          <View style={styles.identity}>
            <Text accessibilityRole="header" style={[typeScale.screen, { color: colors.primaryText }]}>{report.title}</Text>
            <Text style={[typeScale.body, { color: colors.secondaryText }]}>{report.confirmedSpecies ?? report.species}</Text>
            <View style={styles.badges}>
              <ReportStatusPill status={report.status} />
              {risk && <RiskPill severity={risk} />}
            </View>
            <View style={styles.badges}>
              <ReferenceCode key={report.reference_code} code={report.reference_code} />
              <SupportingText>{formatTimestamp(report.createdAt)}</SupportingText>
            </View>
            {location && <View style={styles.location}>
              <MapPin size={16} color={colors.accent} /><View style={{ flex: 1 }}><SupportingText>{location}</SupportingText></View>
            </View>}
          </View>
          {events.length > 0 && <Surface>
            <SectionTitle title="Report progress" />
            {events.map(({ event, at }, index) => {
              const Icon = activityIcons[event as keyof typeof activityIcons] ?? FileCheck2;
              const ink = event === 'rejected' ? colors.clay : colors.successText;
              return <View key={event + at} style={styles.activity}>
                <View style={styles.stepMarker}>
                  <View style={[styles.stepIcon, { backgroundColor: event === 'rejected' ? colors.dangerTint : colors.softAccent }]}>
                    <Icon size={17} color={ink} />
                  </View>
                  {index < events.length - 1 && <View style={[styles.connector, { backgroundColor: colors.border }]} />}
                </View>
                <View style={styles.stepText}>
                  <Text style={[typeScale.action, { color: colors.primaryText }]}>{eventLabels[event] ?? 'Report updated'}</Text>
                  <SupportingText>{formatTimestamp(at)}</SupportingText>
                </View>
              </View>;
            })}
          </Surface>}
          {!!report.rejectionReason && <Surface style={{ backgroundColor: colors.dangerTint }}>
            <Field label="Rejection reason" value={report.rejectionReason} />
          </Surface>}
          <Surface>
            <SectionTitle title="Your observation" />
            <View style={styles.fields}>
              <Field label="Category" value={report.category === 'conflict' ? 'Conflict' : 'Sighting'} />
              <Field label="Reported animal" value={report.species} />
              <Field label="Location source" value={source === 'gps' ? 'Selected coordinates' : source === 'village' ? 'Village selection' : undefined} />
            </View>
            <Field label="Description" value={report.description} />
          </Surface>
          {analysisLabel && <Surface>
            <SectionTitle title="AI photo analysis" />
            <SupportingText>{analysisLabel}</SupportingText>
            {report.suggestions.length > 0 && <Field label="Suggested animals" value={report.suggestions.join(', ')} />}
          </Surface>}
          {!!hasResponse && <Surface>
            <SectionTitle title="Authority findings" />
            <Field label="Confirmed animal" value={report.confirmedSpecies} />
            <Field label="Review note" value={report.reviewNote} />
            <Field label="Resolution" value={report.resolutionNote} />
          </Surface>}
        </View>
      )}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  const { colors } = useTheme();
  if (!value) return null;
  return <View style={styles.field}>
    <SupportingText>{label}</SupportingText>
    <Text style={[typeScale.body, { color: colors.primaryText }]}>{value}</Text>
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
  if (!photo) return <Feedback title="Loading photograph…" kind="loading" />;
  return <>
    <PhotoPreview photo={photo} onExpand={() => setViewing(true)} />
    {viewing && <PhotoViewer photo={photo} onClose={() => setViewing(false)} />}
  </>;
}

const styles = StyleSheet.create({
  report: { gap: spacing.md },
  identity: { gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  location: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { flexBasis: '44%', flexGrow: 1, minWidth: 120, gap: spacing.xs },
  activity: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  stepMarker: { alignItems: 'center' },
  stepIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 1, flex: 1, marginTop: spacing.xs, marginBottom: -spacing.xs },
  stepText: { flex: 1, gap: spacing.xs, paddingBottom: spacing.sm },
});
