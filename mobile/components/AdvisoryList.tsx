import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTimestamp } from '@/format';
import type { Resource } from '@/hooks/usePublicData';
import type { PublicAdvisories } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';
import { Feedback, SupportingText } from './Feedback';

export function AdvisoryList({ state, retry, radiusKm }: {
  state: Resource<PublicAdvisories>; retry: () => void; radiusKm: number;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState<number>();
  if (state.kind === 'loading') return <Feedback title="Loading alerts…" kind="loading" />;
  if (state.kind === 'unavailable') return <Feedback title="Alerts unavailable" detail={state.message} />;
  if (state.kind === 'error') return <Feedback title="Could not load alerts" detail={state.message} kind="error" retry={retry} />;
  if (state.kind !== 'ready') return null;

  const { items } = state.data;
  if (items.length === 0) return <Feedback title={`No active alerts within ${radiusKm} km`} />;

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }}
          onPress={() => setExpanded(expanded === item.id ? undefined : item.id)}
          style={[styles.advisory, { backgroundColor: colors.card, borderColor: colors.border,
            borderLeftColor: item.severity === 'high' ? colors.clay : item.severity === 'moderate' ? colors.amber : colors.moss }]}>
          <View style={styles.meta}>
            <Text accessibilityRole="header" style={[typeScale.card, { color: colors.primaryText, flexShrink: 1 }]}>{item.title ?? item.speciesName}</Text>
            <Text style={[typeScale.supporting, { color: item.severity === 'high' ? colors.clay : item.severity === 'moderate' ? colors.warningText : colors.successText }]}>
              {capitalize(item.severity)} risk
            </Text>
          </View>
          <SupportingText>{[item.area, ...item.villageNames.filter(name => name !== item.area), item.distanceKm === undefined ? undefined
            : item.distanceKm === 0 ? 'Less than 1 km away' : `About ${item.distanceKm} km away`].filter(Boolean).join(' · ')}</SupportingText>
          <SupportingText>{[item.isSimulated ? 'Simulated alert' : null, formatTimestamp(item.publishedAt)]
            .filter(Boolean).join(' · ')}</SupportingText>
          {expanded === item.id && item.summary && <Text style={[typeScale.body, { color: colors.primaryText }]}>{item.summary}</Text>}
          {expanded === item.id && item.advice && !item.summary?.includes(item.advice)
            && <Text style={[typeScale.body, { color: colors.secondaryText }]}>{item.advice}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  advisory: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.input, borderWidth: 1, borderLeftWidth: 3 },
});
