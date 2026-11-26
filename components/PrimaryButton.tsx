import { ArrowRight, Plus } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing, typography, useTheme } from '../theme';

type Props = { label: string; onPress: () => void; icon?: 'arrow' | 'plus'; disabled?: boolean; loading?: boolean };

export function PrimaryButton({ label, onPress, icon = 'arrow', disabled = false, loading = false }: Props) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const Icon = icon === 'plus' ? Plus : ArrowRight;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress} disabled={inactive}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.primaryAction, opacity: inactive ? 0.65 : pressed ? 0.82 : 1 }]}>
      <Text style={[styles.text, { color: colors.onAction }]}>{label}</Text>
      {loading ? <ActivityIndicator color={colors.lime} /> : <Icon size={19} color={colors.lime} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: radius.input, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  text: { flexShrink: 1, fontFamily: typography.body, fontSize: 15, fontWeight: '700' },
});
