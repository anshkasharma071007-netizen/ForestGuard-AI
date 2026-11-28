import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typeScale, useTheme } from '@/theme';
import { TextAction } from './TextAction';

export function Feedback({ title, detail, kind = 'info', retry }: {
  title: string; detail?: string; kind?: 'info' | 'loading' | 'error'; retry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={styles.feedback}>
      <View style={styles.line}>
        {kind === 'loading' && <ActivityIndicator color={colors.accent} />}
        <Text style={[typeScale.card, styles.flex, { color: kind === 'error' ? colors.clay : colors.primaryText }]}>{title}</Text>
      </View>
      {detail && <Text style={[typeScale.supporting, { color: colors.secondaryText }]}>{detail}</Text>}
      {retry && <View style={styles.action}><TextAction label="Try again" onPress={retry} /></View>}
    </View>
  );
}

export function SupportingText({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  const { colors } = useTheme();
  return <Text accessibilityLiveRegion={error ? 'polite' : undefined}
    style={[typeScale.supporting, { color: error ? colors.clay : colors.secondaryText }]}>{children}</Text>;
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const { colors } = useTheme();
  const tones = {
    neutral: [colors.card, colors.secondaryText],
    success: [colors.successTint, colors.successText],
    warning: [colors.warningTint, colors.warningText],
    danger: [colors.dangerTint, colors.clay],
    info: [colors.softAccent, colors.infoText],
  };
  const [backgroundColor, color] = tones[tone];
  return <View style={[styles.pill, { backgroundColor }]}><Text style={[typeScale.supporting, { color }]}>{label}</Text></View>;
}

export function RiskPill({ severity }: { severity: string }) {
  const tone = severity === 'high' ? 'danger' : severity === 'moderate' ? 'warning' : severity === 'low' ? 'success' : 'neutral';
  return <StatusPill label={`${severity.charAt(0).toUpperCase()}${severity.slice(1)} risk`} tone={tone} />;
}

const styles = StyleSheet.create({
  feedback: { gap: spacing.xs, paddingVertical: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  action: { alignItems: 'flex-start' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
