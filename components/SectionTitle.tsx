import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useTheme } from '../theme';
import { TextAction } from './TextAction';

type Props = { title: string; action?: { label: string; onPress: () => void } };

export function SectionTitle({ title, action }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.primaryText }]}>{title}</Text>
      {action && <TextAction {...action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flexShrink: 1, fontFamily: typography.heading, fontSize: 20, fontWeight: '700' },
});
