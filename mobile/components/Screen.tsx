import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sizing, spacing, useTheme } from '../theme';

export function Screen({ children, tab = false, refresh }: PropsWithChildren<{
  tab?: boolean; refresh?: { onRefresh: () => void; refreshing: boolean };
}>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}
      edges={tab ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
          refreshControl={refresh && Platform.OS !== 'web'
            ? <RefreshControl {...refresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: sizing.content, alignSelf: 'center', padding: spacing.lg },
});
