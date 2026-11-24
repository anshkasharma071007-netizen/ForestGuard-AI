import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useTheme } from '../theme';

export function SectionTitle({ title, action }: { title: string; action?: string }) {
  const { colors } = useTheme();
  return <View style={styles.row}><Text style={[styles.title, { color: colors.primaryText }]}>{title}</Text>{action && <Text style={[styles.action, { color: colors.moss }]}>{action}</Text>}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontFamily: typography.heading, fontSize: 20, fontWeight: '700' },
  action: { fontSize: 13, fontWeight: '700' },
});
