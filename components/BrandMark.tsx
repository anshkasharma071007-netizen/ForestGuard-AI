import { Droplets } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography, useTheme } from '../theme';

export function BrandMark() {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: colors.lime }]}><Droplets size={20} color={colors.deepForest} strokeWidth={2.5} /></View>
      <Text accessibilityRole="header" style={[styles.name, { color: colors.primaryText }]}>Forest Guard AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { flexShrink: 1, fontFamily: typography.heading, fontSize: 19, fontWeight: '700' },
});
