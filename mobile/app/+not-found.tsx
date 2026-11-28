import { useLanguage } from '@/i18n';
import { router } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

export default function NotFoundScreen() {
  const { t } = useLanguage();
  return (
    <Screen header={<ScreenHeader title={t('Page not found')} back />}>
      <PrimaryButton label={t('Go to Home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
