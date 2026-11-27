import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { spacing, typeScale, useTheme } from '../theme';
import { TextAction, type TextActionProps } from './TextAction';

type Props = { title: string; action?: TextActionProps; trailing?: ReactNode };

export function SectionTitle({ title, action, trailing }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.primaryText }]}>{title}</Text>
      {action && <TextAction {...action} />}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flexShrink: 1, ...typeScale.section },
});
