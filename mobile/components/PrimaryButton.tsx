import { ArrowRight, Plus, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { radius, sizing, spacing, typeScale, useTheme } from '../theme';

type ButtonProps = { label: string; onPress: () => void; icon?: 'arrow' | 'plus' | LucideIcon; disabled?: boolean; loading?: boolean };

export function PrimaryButton(props: ButtonProps) {
  return <ActionButton {...props} icon={props.icon ?? 'arrow'} />;
}

export function SecondaryButton(props: ButtonProps) {
  return <ActionButton {...props} outlined />;
}

function ActionButton({ label, onPress, icon, disabled = false, loading = false, outlined = false }: ButtonProps & { outlined?: boolean }) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const Icon = icon === 'plus' ? Plus : icon === 'arrow' ? ArrowRight : icon;
  const leading = outlined || icon === 'plus';
  const iconColor = outlined ? colors.accent : colors.onAction;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress} disabled={inactive}
      style={({ pressed }) => [styles.button, outlined ? styles.secondary : styles.primary, leading && styles.centered, {
        backgroundColor: outlined ? (pressed ? colors.successTint : colors.card) : colors.primaryAction,
        borderColor: outlined ? colors.controlBorder : colors.primaryAction,
        opacity: inactive ? 0.6 : pressed && !outlined ? 0.84 : 1,
      }]}>
      {leading && Icon && !loading && <Icon size={18} color={iconColor} />}
      <Text style={[styles.text, { color: outlined ? colors.primaryText : colors.onAction }]}>{label}</Text>
      {loading ? <ActivityIndicator color={iconColor} /> :
        !leading && Icon ? <Icon size={19} color={iconColor} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.input, padding: spacing.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { minHeight: sizing.button, justifyContent: 'space-between' },
  secondary: { minHeight: sizing.touch },
  centered: { justifyContent: 'center' },
  text: { flexShrink: 1, ...typeScale.action },
});
