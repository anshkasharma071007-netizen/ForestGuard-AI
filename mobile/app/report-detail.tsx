import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { Feedback, SupportingText } from '@/components/Feedback';
import { ReportStatusPill } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenEvidence, getCitizenReport } from '@/services/api';
import { radius, spacing } from '@/theme';

export default function ReportDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { access } = useCitizen();
  const focused = useIsFocused();
  const active = useAppActive();
  const fetchReport = useCallback((signal: AbortSignal) => getCitizenReport(access, code, signal), [access, code]);
  const { state, reload } = usePublicData(fetchReport, focused && active && !!code, 10000);
  const report = state.kind === 'ready' ? state.data : null;

  return (
    <Screen>
      <ScreenHeader title={report?.title ?? 'Report details'} back />
      {!code ? <Feedback title="Report unavailable" /> : state.kind === 'loading' && <Feedback title="Loading report…" kind="loading" />}
      {'message' in state && <Feedback title="Could not load report" detail={state.message} kind="error" retry={reload} />}
      {report && (
        <View style={{ gap: spacing.md }}>
          <View style={{ alignSelf: 'flex-start' }}><ReportStatusPill status={report.status} /></View>
          <SupportingText>{report.reference_code} · {new Date(report.createdAt).toLocaleString()}</SupportingText>
          <SupportingText>{report.category === 'conflict' ? 'Conflict' : 'Sighting'} · {report.species}</SupportingText>
          {report.village && <SupportingText>{report.village}</SupportingText>}
          {!report.village && report.coordinates && <SupportingText>
            GPS: {report.coordinates.lat.toFixed(5)}, {report.coordinates.lon.toFixed(5)}
          </SupportingText>}
          {report.description && <SupportingText>{report.description}</SupportingText>}
          {report.hasPhoto && (
            <>
              <SectionTitle title="Incident photo" />
              <IncidentPhoto key={report.reference_code} code={report.reference_code} />
              {report.suggestions.length > 0 && <SupportingText>AI suggestions: {[...new Set(report.suggestions)].join(', ')}</SupportingText>}
              {['queued', 'processing'].includes(report.analysis) && <SupportingText>Photo analysis pending.</SupportingText>}
              {report.analysis === 'failed' && <SupportingText>Photo analysis unavailable. Your report is still available for authority review.</SupportingText>}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function IncidentPhoto({ code }: { code: string }) {
  const { access } = useCitizen();
  const [imageError, setImageError] = useState(false);
  const [source, setSource] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let objectUrl: string | undefined;
    let reader: FileReader | undefined;
    if (access.signal.aborted) return;
    access.signal.addEventListener('abort', cancel, { once: true });
    void getCitizenEvidence(access, code, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      if (Platform.OS === 'web') {
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } else {
        // In-memory source so the image loader never caches the authenticated URL.
        reader = new FileReader();
        reader.onload = () => {
          if (!controller.signal.aborted && typeof reader?.result === 'string') setSource(reader.result);
        };
        reader.onerror = () => { if (!controller.signal.aborted) setImageError(true); };
        reader.readAsDataURL(blob);
      }
    }).catch(() => { if (!controller.signal.aborted) setImageError(true); });
    return () => {
      access.signal.removeEventListener('abort', cancel);
      cancel();
      reader?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [access, code]);

  if (imageError) return <SupportingText>Photo could not be loaded.</SupportingText>;
  if (!source) return <SupportingText>Loading photo…</SupportingText>;
  return (
    <Image accessibilityLabel="Submitted incident photo"
      source={{ uri: source }}
      onError={() => setImageError(true)} resizeMode="contain" style={{ width: '100%', height: 260, borderRadius: radius.card }} />
  );
}
