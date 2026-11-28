import { router, useIsFocused } from 'expo-router';
import { Bell, ClipboardList, Languages, LogOut, MapPin, Moon, ShieldCheck, UserRound } from 'lucide-react-native';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { NavigationRow } from '@/components/Controls';
import { Feedback, StatusPill, SupportingText } from '@/components/Feedback';
import { locationName } from '@/components/LocationField';
import { ReportStats } from '@/components/ReportStats';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { Surface } from '@/components/Surface';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenReports } from '@/services/api';
import { useAppTheme } from '@/theme-context';
import { radius, spacing, typeScale, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { profile, access, signOut } = useCitizen();
  const { mode } = useAppTheme();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const active = useAppActive();
  const fetchReports = useCallback((signal: AbortSignal) => getCitizenReports(access, signal), [access]);
  const { state, reload, refreshing, refreshError } = usePublicData(fetchReports, focused && active, 10000);
  if (!profile) return null;

  const initials = profile.name.trim().split(/\s+/u).slice(0, 2)
    .map(part => Array.from(part)[0] ?? '').join('').toLocaleUpperCase();
  const openSettings = (section: 'personal' | 'location' | 'notifications' | 'language') =>
    router.push({ pathname: '/profile-settings', params: { section } });

  return <Screen tab header={<ScreenHeader title="Profile" />} refresh={{ onRefresh: reload, refreshing }}>
    <View style={styles.profile}>
      <View style={styles.identity}>
        <View accessible={false} style={[styles.avatar, { backgroundColor: colors.softAccent }]}>
          {initials ? <Text style={[typeScale.screen, { color: colors.accent }]}>{initials}</Text>
            : <UserRound size={28} color={colors.accent} />}
        </View>
        <View style={styles.identityText}>
          <Text accessibilityRole="header" style={[typeScale.screen, { color: colors.primaryText }]}>{profile.name || 'Citizen account'}</Text>
          {profile.email && <SupportingText>{profile.email}</SupportingText>}
          {profile.emailVerified && <StatusPill label="Verified email" tone="success" />}
        </View>
      </View>
      <Surface>
        <SectionTitle title="Reporting activity" />
        {state.kind === 'loading' && <Feedback title="Loading activity…" kind="loading" />}
        {'message' in state && <Feedback title="Could not load activity" detail={state.message} kind="error" retry={reload} />}
        {!!refreshError && <SupportingText error>{refreshError}</SupportingText>}
        {state.kind === 'ready' && <ReportStats reports={state.data} />}
      </Surface>
      <Surface style={styles.rows}>
        <NavigationRow label="Personal information" detail="Name, email and mobile number" icon={UserRound} onPress={() => openSettings('personal')} />
        <NavigationRow label="Saved location" detail={profile.savedAlertLocation ? locationName(profile.savedAlertLocation) : 'Choose a location for nearby alerts'}
          icon={MapPin} onPress={() => openSettings('location')} />
        <NavigationRow label="Report history" icon={ClipboardList} onPress={() => router.push('/all-reports')} />
        <NavigationRow label="Notification preferences" detail="Report updates and nearby alerts" icon={Bell} onPress={() => openSettings('notifications')} />
        <NavigationRow label="Appearance" detail={mode === 'system' ? 'Follow device' : mode === 'light' ? 'Light' : 'Dark'}
          icon={Moon} onPress={() => router.push('/settings')} />
        <NavigationRow label="Language" detail="English" icon={Languages} onPress={() => openSettings('language')} />
        <NavigationRow label="Privacy and safety" icon={ShieldCheck} onPress={() => router.push('/guidelines')} />
        <NavigationRow label="Sign out" icon={LogOut} onPress={() => void signOut()} />
      </Surface>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  profile: { gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  identityText: { flex: 1, gap: spacing.xs },
  avatar: { width: 62, height: 62, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rows: { paddingHorizontal: spacing.md, paddingVertical: 0, gap: 0 },
});
