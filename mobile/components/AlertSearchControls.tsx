import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { Dropdown, SegmentedControl } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { LocationField, locationName } from '@/components/LocationField';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import { alertRadii, type AlertRadius } from '@/services/nearby-alerts';
import { spacing } from '@/theme';

const radiusOptions = alertRadii.map(km => ({ id: `${km}` as const, label: `${km} km` }));

export function AlertSearchControls({ onChange }: { onChange?: () => void }) {
  const { profile, access, alertLocation, alertRadius, selectAlertLocation, saveLocation, saveAlertRadius, savingAlertRadius } = useCitizen();
  const [notice, setNotice] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');
  const [choosing, setChoosing] = useState(false);
  const saved = profile?.savedAlertLocation;
  const label = alertLocation?.source === 'saved' ? (saved && locationName(saved)) : alertLocation?.label;

  async function changeRadius(value: AlertRadius) {
    if (value === alertRadius && !notice) return;
    onChange?.();
    setNotice('');
    try {
      const persisted = await saveAlertRadius(value);
      if (!persisted && !access.signal?.aborted) setNotice('This radius is active for this session only.');
    } catch {
      if (!access.signal?.aborted) setNotice('The radius is active. Tap it again to retry saving your preference.');
    }
  }

  async function saveAlertLocation() {
    if (!alertLocation || alertLocation.source === 'saved' || savingLocation) return;
    setSavingLocation(true);
    setLocationNotice('');
    try {
      const { lat, lon, label } = alertLocation;
      await saveLocation({ lat, lon, label });
      selectAlertLocation({ source: 'saved' });
    } catch (error) {
      if (!access.signal?.aborted) setLocationNotice(error instanceof Error ? error.message : 'Could not save this location.');
    } finally {
      if (!access.signal?.aborted) setSavingLocation(false);
    }
  }

  return <View style={{ gap: spacing.sm }}>
    <Dropdown label={label || 'Choose alert location'} accessibilityLabel="Choose alert location" icon={MapPin}
      expanded={choosing} disabled={savingLocation} onPress={() => setChoosing(value => !value)} />
    <Modal visible={choosing} animationType="slide" onRequestClose={() => setChoosing(false)}>
      <Screen header={<ScreenHeader title="Alert location" onBack={() => setChoosing(false)} />}>
        <View style={{ gap: spacing.md }}>
          <LocationField label="Choose alert location" value={null} disabled={savingLocation} onChange={(point, method) => {
            if (point.type === 'gps') selectAlertLocation({ ...point, source: method === 'gps' ? 'gps' : 'selected' });
            onChange?.();
            setLocationNotice('');
            setChoosing(false);
          }} />
          {saved && <TextAction label="Use saved location" onPress={() => {
            selectAlertLocation({ source: 'saved' });
            onChange?.();
            setChoosing(false);
          }} />}
        </View>
      </Screen>
    </Modal>
    {alertLocation && alertLocation.source !== 'saved' && <TextAction label="Save this alert location"
      disabled={savingLocation} loading={savingLocation} onPress={() => void saveAlertLocation()} />}
    {!!locationNotice && <SupportingText error>{locationNotice}</SupportingText>}
    <SegmentedControl compact label="Alert radius" options={radiusOptions} value={`${alertRadius}`}
      onChange={value => void changeRadius(Number(value) as AlertRadius)} disabled={savingAlertRadius} />
    {!!notice && <SupportingText>{notice}</SupportingText>}
  </View>;
}
