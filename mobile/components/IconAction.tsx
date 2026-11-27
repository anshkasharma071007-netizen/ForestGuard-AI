import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { radius, sizing, useTheme } from '@/theme';

export function IconAction({ icon: Icon, label, onPress, loading = false }: {
  icon: LucideIcon; label: string; onPress: () => void; loading?: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={loading}
    accessibilityState={{ busy: loading }} onPress={onPress}
    style={({ pressed }) => [styles.target, pressed && { backgroundColor: colors.successTint }]}>
    {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon size={19} color={colors.primaryText} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  target: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.input },
});
