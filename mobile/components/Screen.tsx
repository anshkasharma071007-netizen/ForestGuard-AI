import type { PropsWithChildren, ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sizing, spacing, useTheme } from '../theme';

export function Screen({ children, tab = false, header, scroll = true, refresh }: PropsWithChildren<{
  tab?: boolean; header?: ReactNode; scroll?: boolean; refresh?: { onRefresh: () => void; refreshing: boolean };
}>) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={header || isDark ? 'light' : 'dark'} />
      {header && <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: colors.header }}>
        <View style={styles.header}>{header}</View>
      </SafeAreaView>}
      <SafeAreaView style={styles.flex} edges={[
        ...(!header ? ['top' as const] : []), ...(!tab ? ['bottom' as const] : []), 'left', 'right',
      ]}>
        {scroll ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}
            refreshControl={refresh && Platform.OS !== 'web'
              ? <RefreshControl {...refresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}>
            {children}
          </ScrollView>
        </KeyboardAvoidingView> : <View style={[styles.content, styles.flex]}>{children}</View>}
      </SafeAreaView>
    </View>
  );
}

const width = { width: '100%' as const, maxWidth: sizing.content, alignSelf: 'center' as const };
const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { ...width, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { ...width, flexGrow: 1, padding: spacing.lg },
});
