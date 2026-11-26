import { useFonts } from 'expo-font';
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
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Semibold': require('../assets/fonts/Inter-Semibold.ttf'),
    'Fraunces-Semibold': require('../assets/fonts/Fraunces-Semibold.ttf'),
  });
  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <BrandMark fontReady={fontsLoaded} />
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
