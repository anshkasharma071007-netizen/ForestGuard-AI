import { AdvisoryList } from '@/components/AdvisoryList';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { useAdvisories } from '@/hooks/useAdvisories';
import { View } from 'react-native';

export default function AlertsScreen() {
  const { area, setArea, alerts } = useAdvisories();
  return (
    <Screen tab>
      <ScreenHeader title="Alerts" />
      {area && <TextAction label={`Show all villages · currently ${area.name}`} onPress={() => setArea(null)} />}
      <AdvisoryList villageName={area?.name} state={alerts.state} retry={alerts.reload} />
      {alerts.state.kind === 'ready' && (
        <View style={{ alignItems: 'flex-start' }}>
          <TextAction label="Refresh alerts" onPress={alerts.reload} />
        </View>
      )}
    </Screen>
  );
}
