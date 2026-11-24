import { Leaf } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, useTheme } from '../theme';

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  const { colors } = useTheme();
  return <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}><Leaf size={24} color={colors.moss} /><Text style={[styles.title, { color: colors.primaryText }]}>{title}</Text><Text style={[styles.detail, { color: colors.mutedText }]}>{detail}</Text></View>;
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: typography.heading, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  detail: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
