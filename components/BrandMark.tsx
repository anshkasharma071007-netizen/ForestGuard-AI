import { Droplets } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, typography } from '../theme';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: colors.lime }]}><Droplets size={20} color={colors.deepForest} strokeWidth={2.5} /></View>
      <View>
        <Text style={[styles.name, { color: colors.primaryText }]}>Forest Guard <Text style={{ color: colors.moss }}>AI</Text></Text>
        {!compact && <Text style={[styles.caption, { color: colors.mutedText }]}>CONSERVATION INTELLIGENCE</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: typography.heading, fontSize: 18, fontWeight: '700' },
  caption: { fontFamily: typography.body, fontSize: 8, fontWeight: '700', letterSpacing: 1.6, marginTop: 3 },
});
