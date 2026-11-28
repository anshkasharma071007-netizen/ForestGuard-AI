import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { radius, sizing, useTheme } from '@/theme';

export function IconAction({ icon: Icon, label, onPress, loading = false, tone = 'default' }: {
  icon: LucideIcon; label: string; onPress: () => void; loading?: boolean; tone?: 'default' | 'header';
}) {
  const { colors } = useTheme();
  const foreground = tone === 'header' ? colors.onHeader : colors.primaryText;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={loading}
    accessibilityState={{ busy: loading }} onPress={onPress}
    style={({ pressed }) => [styles.target, pressed && { backgroundColor: tone === 'header' ? '#FFFFFF20' : colors.softAccent }]}>
    {loading ? <ActivityIndicator size="small" color={foreground} /> : <Icon size={19} color={foreground} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  target: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.input },
});
