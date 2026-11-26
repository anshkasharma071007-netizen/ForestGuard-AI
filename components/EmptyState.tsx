import { Text, View } from 'react-native';
import { spacing, useTheme } from '../theme';

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
      <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      {detail && <Text style={{ color: colors.secondaryText, fontSize: 15, lineHeight: 22 }}>{detail}</Text>}
    </View>
  );
}
