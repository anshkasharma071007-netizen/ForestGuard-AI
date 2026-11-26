import { View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { ThemeProvider, useAppTheme } from '@/theme-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  useFrameworkReady();
  return <ThemeProvider><AppShell /></ThemeProvider>;
}

function AppShell() {
  const { colors, isDark } = useTheme();
  const { ready } = useAppTheme();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <BrandMark />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="report" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="guidelines" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}
