import { Text, View } from 'react-native';
import { spacing, typeScale, useTheme } from '../theme';

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
      <Text style={{ color: colors.primaryText, ...typeScale.card }}>{title}</Text>
      {detail && <Text style={{ color: colors.secondaryText, ...typeScale.body }}>{detail}</Text>}
    </View>
  );
}
