import { router } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

export default function NotFoundScreen() {
  return (
    <Screen>
      <ScreenHeader title="Page not found" back />
      <PrimaryButton label="Go to Home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
