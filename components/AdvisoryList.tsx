import { ActivityIndicator, Text, View } from 'react-native';
import { radius, spacing, typeScale, useTheme } from '../theme';
import { EmptyState } from './EmptyState';

export type Advisory = {
  id: string;
  severity: string;
  area: string;
  title: string;
  precautions: string;
  publishedAt: string;
};

export type AdvisoryState =
  | { kind: 'loading' | 'unavailable' }
  | { kind: 'error' }
  | { kind: 'ready'; items: readonly Advisory[] };

export function AdvisoryList({ state }: { state: AdvisoryState }) {
  const { colors } = useTheme();
  if (state.kind === 'loading') return <ActivityIndicator accessibilityLabel="Loading alerts" color={colors.primaryText} />;
  if (state.kind === 'unavailable') return <EmptyState title="Alerts unavailable" />;
  if (state.kind === 'error') return <EmptyState title="Alerts could not be loaded" />;
  if (state.kind !== 'ready' || state.items.length === 0) return <EmptyState title="No alerts to show" />;
  return (
    <View style={{ gap: spacing.md }}>
      {state.items.map((item) => (
        <View key={item.id} style={{ gap: spacing.xs, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.card }}>
          <Text style={{ color: colors.secondaryText, ...typeScale.supporting }}>{item.severity} · {item.area}</Text>
          <Text accessibilityRole="header" style={{ color: colors.primaryText, ...typeScale.card }}>{item.title}</Text>
          <Text style={{ color: colors.primaryText, ...typeScale.body }}>{item.precautions}</Text>
          <Text style={{ color: colors.mutedText, ...typeScale.supporting }}>Published {new Date(item.publishedAt).toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}
