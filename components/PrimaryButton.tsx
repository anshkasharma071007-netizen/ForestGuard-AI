import { ArrowRight, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing, typography, useTheme } from '../theme';

export function PrimaryButton({ label, onPress, icon = 'arrow' }: { label: string; onPress?: () => void; icon?: 'arrow' | 'plus' }) {
  const { colors } = useTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: colors.primaryAction, opacity: pressed ? 0.82 : 1 }]}><Text style={[styles.text, { color: '#F7F8F1' }]}>{label}</Text>{icon === 'plus' ? <Plus size={19} color={colors.lime} /> : <ArrowRight size={19} color={colors.lime} />}</Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: radius.input, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { fontFamily: typography.body, fontSize: 15, fontWeight: '700' },
});
