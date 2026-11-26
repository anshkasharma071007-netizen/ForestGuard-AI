import { StyleSheet, Text, View } from 'react-native';
import type { Resource } from '@/hooks/usePublicData';
import type { PublicAdvisories } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';
import { Feedback, StatusPill, SupportingText } from './Feedback';

export function AdvisoryList({ state, retry, villageName, limit }: {
  state: Resource<PublicAdvisories>; retry: () => void; villageName?: string; limit?: number;
}) {
  const { colors } = useTheme();
  if (state.kind === 'loading') return <Feedback title="Loading alerts…" kind="loading" />;
  if (state.kind === 'unavailable') return <Feedback title="Alerts unavailable" detail={state.message} />;
  if (state.kind === 'error') return <Feedback title="Could not load alerts" detail={state.message} kind="error" retry={retry} />;
  if (state.kind !== 'ready') return null;

  const matches = villageName ? state.data.items.filter((item) => item.villageNames.includes(villageName)) : state.data.items;
  const items = matches.slice(0, limit ?? matches.length);
  if (items.length === 0) return <Feedback title={villageName ? 'No listed alerts for this village' : 'No field alerts to show'}
    detail={`The public feed covers the past ${state.data.windowDays} days.`} />;

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.id} style={[styles.advisory, { backgroundColor: colors.card }]}>
          <View style={styles.meta}>
            <StatusPill label={`${capitalize(item.severity)} priority`} tone={severityTone(item.severity)} />
            <SupportingText>{new Date(item.publishedAt).toLocaleString()}</SupportingText>
          </View>
          <Text accessibilityRole="header" style={[typeScale.card, { color: colors.primaryText }]}>{item.speciesName}</Text>
          <SupportingText>{[item.area, ...item.villageNames.filter((name) => name !== item.area)].join(' · ')}</SupportingText>
          {item.summary && <Text style={[typeScale.body, { color: colors.primaryText }]}>{item.summary}</Text>}
          {item.advice && <Text style={[typeScale.body, { color: colors.secondaryText }]}>{item.advice}</Text>}
        </View>
      ))}
    </View>
  );
}

function severityTone(severity: string) {
  if (severity === 'high') return 'danger';
  if (severity === 'moderate') return 'warning';
  if (severity === 'low') return 'success';
  return 'neutral';
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  advisory: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.card },
});
