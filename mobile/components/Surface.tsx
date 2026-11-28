import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { elevation, radius, spacing, useTheme } from '@/theme';

export function Surface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useTheme();
  return <View style={[styles.surface, elevation.subtle, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
});
