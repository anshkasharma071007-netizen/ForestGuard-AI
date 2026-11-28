import type { PropsWithChildren, ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
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
        <LinearGradient colors={[colors.headerFrom, colors.headerTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.headerGradient}>
          <View pointerEvents="none" accessible={false} style={[styles.glow, styles.glowOne, { backgroundColor: colors.lime }]} />
          <View pointerEvents="none" accessible={false} style={[styles.glow, styles.glowTwo, { backgroundColor: colors.lime }]} />
          <View style={styles.header}>{header}</View>
        </LinearGradient>
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
  headerGradient: { overflow: 'hidden' },
  glow: { position: 'absolute', borderRadius: 999, opacity: 0.1 },
  glowOne: { width: 180, height: 180, top: -110, right: -40 },
  glowTwo: { width: 120, height: 120, bottom: -80, left: -30, opacity: 0.06 },
  header: { ...width, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { ...width, flexGrow: 1, padding: spacing.lg },
});