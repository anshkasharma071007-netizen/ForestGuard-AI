import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Resource } from '@/hooks/usePublicData';
import type { PublicAdvisories } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';
import { Feedback, StatusPill, SupportingText } from './Feedback';

export function AdvisoryList({ state, retry }: {
  state: Resource<PublicAdvisories>; retry: () => void;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState<number>();
  if (state.kind === 'loading') return <Feedback title="Loading alerts…" kind="loading" />;
  if (state.kind === 'unavailable') return <Feedback title="Alerts unavailable" detail={state.message} />;
  if (state.kind === 'error') return <Feedback title="Could not load alerts" detail={state.message} kind="error" retry={retry} />;
  if (state.kind !== 'ready') return null;

  const { items } = state.data;
  if (items.length === 0) return <Feedback title="No nearby verified alerts" />;

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }}
          onPress={() => setExpanded(expanded === item.id ? undefined : item.id)}
          style={[styles.advisory, { backgroundColor: colors.card }]}>
          <View style={styles.meta}>
            <StatusPill label={`${capitalize(item.severity)} risk`} tone={severityTone(item.severity)} />
            <SupportingText>{new Date(item.publishedAt).toLocaleString()}</SupportingText>
          </View>
          <Text accessibilityRole="header" style={[typeScale.card, { color: colors.primaryText }]}>{item.speciesName}</Text>
          <SupportingText>{[item.area, ...item.villageNames.filter((name) => name !== item.area)].join(' · ')}</SupportingText>
          {item.distanceKm !== undefined && <SupportingText>
            {item.distanceKm < 1 ? 'Less than 1 km away' : `About ${Math.round(item.distanceKm)} km away`}
          </SupportingText>}
          {expanded === item.id && item.summary && <Text style={[typeScale.body, { color: colors.primaryText }]}>{item.summary}</Text>}
          {expanded === item.id && item.advice && <Text style={[typeScale.body, { color: colors.secondaryText }]}>{item.advice}</Text>}
        </Pressable>
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
