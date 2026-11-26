import { AdvisoryList } from '@/components/AdvisoryList';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { usePublicData } from '@/hooks/usePublicData';
import { getPublicAlerts } from '@/services/api';
import { View } from 'react-native';

export default function AlertsScreen() {
  const alerts = usePublicData(getPublicAlerts);
  return (
    <Screen tab>
      <ScreenHeader title="Alerts" />
      <AdvisoryList state={alerts.state} retry={alerts.reload} />
      {alerts.state.kind === 'ready' && (
        <View style={{ alignItems: 'flex-start' }}>
          <TextAction label="Refresh alerts" onPress={alerts.reload} />
        </View>
      )}
    </Screen>
  );
}
