import { router, useLocalSearchParams } from 'expo-router';
import { Bell, Languages } from 'lucide-react-native';
import { Platform, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { PushSettings } from '@/citizen-push';
import { CitizenProfileForm } from '@/components/CitizenProfileForm';
import { Feedback, SupportingText } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NavigationRow } from '@/components/Controls';
import { Surface } from '@/components/Surface';
import { spacing, typeScale, useTheme } from '@/theme';

export default function ProfileSettings() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { profile } = useCitizen();
  const { colors } = useTheme();

  if (section === 'personal' || section === 'location') return <CitizenProfileForm key={section} section={section} />;

  if (section === 'notifications') return <Screen header={<ScreenHeader title="Notification preferences" back />}>
    <Surface>
      <NavigationRow label="In-app report updates" detail="Open your notification inbox" icon={Bell} onPress={() => router.push('/notifications')} />
      {Platform.OS === 'android' && profile?.emailVerified ? <PushSettings />
        : <SupportingText>Push preferences are available in the Android app for verified email accounts.</SupportingText>}
    </Surface>
  </Screen>;

  if (section === 'language') return <Screen header={<ScreenHeader title="Language" back />}>
    <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Languages size={20} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.card, { color: colors.primaryText }]}>English</Text>
        <SupportingText>App language</SupportingText>
      </View>
    </Surface>
  </Screen>;

  return <Screen header={<ScreenHeader title="Profile settings" back />}><Feedback title="Settings page unavailable" /></Screen>;
}
