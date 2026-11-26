import { AdvisoryList } from '@/components/AdvisoryList';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

export default function AlertsScreen() {
  return (
    <Screen tab>
      <ScreenHeader title="Alerts" />
      <AdvisoryList state={{ kind: 'unavailable' }} />
    </Screen>
  );
}
