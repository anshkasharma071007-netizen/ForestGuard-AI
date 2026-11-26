import { Pressable, StyleSheet, Text } from 'react-native';
import { sizing, spacing, typeScale, useTheme } from '../theme';

export function TextAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={styles.action}>
      <Text style={{ color: disabled ? colors.mutedText : colors.primaryText, ...typeScale.action }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { minHeight: sizing.touch, justifyContent: 'center', paddingHorizontal: spacing.sm, flexShrink: 1 },
});
