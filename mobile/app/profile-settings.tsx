import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { PushSettings } from '@/citizen-push';
import { CitizenProfileForm } from '@/components/CitizenProfileForm';
import { Feedback, SupportingText } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { NavigationRow } from '@/components/Controls';
import { Surface } from '@/components/Surface';

export default function ProfileSettings() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { profile } = useCitizen();
  const { t } = useLanguage();

  if (section === 'personal' || section === 'location') return <CitizenProfileForm key={section} section={section} />;

  if (section === 'notifications') return <Screen header={<ScreenHeader title={t('Notification preferences')} back />}>
    <Surface>
      <NavigationRow label={t('In-app report updates')} detail={t('Open your notification inbox')} icon={Bell} onPress={() => router.push('/notifications')} />
      {Platform.OS === 'android' && profile?.emailVerified ? <PushSettings />
        : <SupportingText>{t('Push preferences are available in the Android app for verified email accounts.')}</SupportingText>}
    </Surface>
  </Screen>;

  if (section === 'language') return <Screen header={<ScreenHeader title={t('Language')} back />}>
    <Surface>
      <SupportingText>{t('App language')}</SupportingText>
      <LanguageSwitcher />
    </Surface>
  </Screen>;

  return <Screen header={<ScreenHeader title={t('Profile settings')} back />}><Feedback title={t('Settings page unavailable')} /></Screen>;
}
