import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from './BrandMark';
import { IconAction } from './IconAction';
import { spacing, typeScale, useTheme } from '../theme';

export function ScreenHeader({ title, back = false, onBack, action }: {
  title?: string; back?: boolean; onBack?: () => void; action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {(back || onBack) && <IconAction icon={ArrowLeft} label="Back" tone="header"
        onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/'))} />}
      {title
        ? <Text accessibilityRole="header" style={[typeScale.header, styles.title, { color: colors.onHeader }]}>{title}</Text>
        : <BrandMark onHeader />}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  action: { marginLeft: 'auto' },
});
