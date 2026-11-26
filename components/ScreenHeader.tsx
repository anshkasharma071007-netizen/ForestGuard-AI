import { router } from 'expo-router';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from './BrandMark';
import { spacing, typography, useTheme } from '../theme';

export function ScreenHeader({ title, back = false }: { title?: string; back?: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {back && (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.control}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <ArrowLeft size={22} color={colors.primaryText} />
        </Pressable>
      )}
      {title ? <Text accessibilityRole="header" style={[styles.title, { color: colors.primaryText }]}>{title}</Text> : <BrandMark />}
      {!back && (
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" style={styles.control}
          onPress={() => router.push('/settings')}>
          <Settings size={22} color={colors.primaryText} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  title: { flex: 1, fontFamily: typography.heading, fontSize: 26, fontWeight: '700' },
  control: { minWidth: 48, minHeight: 48, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
});
