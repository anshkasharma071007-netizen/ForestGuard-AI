import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Plus, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { elevation, radius, sizing, spacing, typeScale, useTheme } from '../theme';
import { PressableScale } from './PressableScale';

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
  const content = <View style={[styles.content, leading && styles.contentCentered]}>
    {leading && Icon && !loading && <Icon size={18} color={iconColor} />}
    <Text style={[styles.text, { color: outlined ? colors.primaryText : colors.onAction }]}>{label}</Text>
    {loading ? <ActivityIndicator color={iconColor} /> :
      !leading && Icon ? <Icon size={19} color={iconColor} /> : null}
  </View>;

  return <PressableScale
    onPress={onPress} disabled={inactive} haptic={outlined ? 'light' : 'medium'}
    accessibilityLabel={label} accessibilityState={{ disabled: inactive, busy: loading }}
    containerStyle={outlined ? undefined : elevation.card}
    style={[styles.button, outlined ? styles.secondary : styles.primary, {
      borderColor: outlined ? colors.controlBorder : colors.actionFrom,
      backgroundColor: outlined ? colors.card : colors.primaryAction,
      opacity: inactive ? 0.6 : 1,
    }]}
    pressedStyle={outlined ? { backgroundColor: colors.softAccent } : { opacity: 0.9 }}>
    {outlined
      ? <>{content}</>
      : <>
        <LinearGradient colors={[colors.actionFrom, colors.actionTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.input }]} />
        {content}
      </>}
  </PressableScale>;
}

const styles = StyleSheet.create({
  button: { borderRadius: radius.input, borderWidth: 1, overflow: 'hidden' },
  primary: { minHeight: sizing.button, justifyContent: 'space-between' },
  secondary: { minHeight: sizing.touch },
  content: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, padding: spacing.md, flex: 1,
  },
  contentCentered: { justifyContent: 'center' },
  text: { flexShrink: 1, ...typeScale.action },
});