import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { BrandMark } from '@/components/BrandMark';
import { useTheme, typography } from '@/theme';
import { ThemeProvider } from '@/theme-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return <ThemeProvider><AppShell /></ThemeProvider>;
}

function AppShell() {
  const { colors } = useTheme();
  const [showBranding, setShowBranding] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowBranding(false), 700);
    return () => clearTimeout(timer);
  }, []);

  if (showBranding) {
    return <View style={[styles.splash, { backgroundColor: colors.deepForest }]}><BrandMark /><Text style={[styles.splashText, { color: '#AAB8AD' }]}>PUBLIC SAFETY COMPANION</Text></View>;
  }

  return <><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /><Stack.Screen name="report" options={{ presentation: 'modal' }} /><Stack.Screen name="history" /><Stack.Screen name="guidelines" /><Stack.Screen name="+not-found" /></Stack><StatusBar style="auto" /></>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  splashText: { fontFamily: typography.body, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
});
