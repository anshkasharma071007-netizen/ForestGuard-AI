import { LanguageProvider, useLanguage } from '@/i18n';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';
import { ThemeProvider, useAppTheme } from '@/theme-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { CitizenProvider, useCitizen } from '@/citizen-context';
import { CitizenPushCoordinator } from '@/citizen-push';
import { CitizenNotificationsProvider } from '@/citizen-notifications';
import { Feedback } from '@/components/Feedback';
import { Screen } from '@/components/Screen';

export default function RootLayout() {
  useFrameworkReady();
  return <LanguageProvider><ThemeProvider><CitizenProvider><AppShell /></CitizenProvider></ThemeProvider></LanguageProvider>;
}

function AppShell() {
  const { t, ready: languageReady } = useLanguage();
  const { colors, isDark } = useTheme();
  const { ready } = useAppTheme();
  const { profile, loading, restoreError, retry } = useCitizen();
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Semibold': require('../assets/fonts/Inter-Semibold.ttf'),
    'Manrope-Semibold': require('../assets/fonts/Manrope-Semibold.ttf'),
  });
  if (!ready || !languageReady || loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <BrandMark />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }
  if (restoreError) return <Screen><Feedback title={t('Could not restore your session')} detail={restoreError} kind="error" retry={retry} /></Screen>;
  return (
    <>
      <CitizenNotificationsProvider key={profile?.id ?? 'guest'}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={!profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile && !profile.location}>
          <Stack.Screen name="location-setup" />
        </Stack.Protected>
        <Stack.Protected guard={!!profile?.location}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="report" options={{ presentation: 'modal' }} />
          <Stack.Screen name="report-detail" />
          <Stack.Screen name="all-reports" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="profile-settings" />
          <Stack.Screen name="guidelines" />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
      {profile?.location && <CitizenPushCoordinator />}
      </CitizenNotificationsProvider>
    </>
  );
}
