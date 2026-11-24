import { Bell, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from './BrandMark';
import { spacing, typography, useTheme } from '../theme';

export function ScreenHeader({ showBell = true }: { showBell?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <BrandMark compact />
      <View style={styles.actions}>
        <View style={styles.location}><MapPin size={14} color={colors.moss} /><Text style={[styles.locationText, { color: colors.secondaryText }]}>Pench</Text></View>
        {showBell && <Pressable accessibilityLabel="Alerts" style={[styles.iconButton, { borderColor: colors.border }]}><Bell size={19} color={colors.primaryText} /></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13, fontWeight: '600' },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
