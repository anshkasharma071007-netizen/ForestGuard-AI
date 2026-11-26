import { router } from 'expo-router';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from './BrandMark';
import { sizing, spacing, typeScale, useTheme } from '../theme';

export function ScreenHeader({ title, back = false }: { title?: string; back?: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {back && (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.control}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <ArrowLeft size={sizing.icon} color={colors.primaryText} />
        </Pressable>
      )}
      {title ? <Text accessibilityRole="header" style={[styles.title, { color: colors.primaryText }]}>{title}</Text> : <BrandMark />}
      {!back && (
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" style={[styles.control, styles.settings]}
          onPress={() => router.push('/settings')}>
          <Settings size={sizing.icon} color={colors.primaryText} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  title: { flex: 1, ...typeScale.screen },
  settings: { marginLeft: 'auto' },
  control: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center' },
});
