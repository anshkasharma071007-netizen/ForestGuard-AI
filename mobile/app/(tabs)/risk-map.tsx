import { Feedback } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

export default function RiskMapScreen() {
  return (
    <Screen tab>
      <ScreenHeader title="Map" />
      <Feedback title="Risk map unavailable" detail="Public wildlife risk zones aren’t available in the app yet." />
    </Screen>
  );
}
