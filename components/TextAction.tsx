import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { sizing, spacing, typeScale, useTheme } from '../theme';

export type TextActionProps = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };

export function TextAction({ label, onPress, disabled = false, loading = false }: TextActionProps) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.72 : 1 }]}>
      {loading && <ActivityIndicator color={colors.accent} />}
      <Text style={[typeScale.action, styles.label, { color: disabled ? colors.mutedText : colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { minHeight: sizing.touch, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, flexShrink: 1 },
  label: { flexShrink: 1 },
});
