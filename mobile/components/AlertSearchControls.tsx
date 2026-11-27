import { useState } from 'react';
import { View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { SegmentedControl } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { alertRadii, type AlertRadius, type AlertLocation } from '@/services/nearby-alerts';
import { spacing } from '@/theme';

const gps = { id: 'gps', label: 'Current GPS' } as const;
const saved = { id: 'saved', label: 'Saved location' } as const;
const radiusOptions = alertRadii.map(km => ({ id: `${km}` as const, label: `${km} km` }));

export function AlertSearchControls({ onChange }: { onChange?: () => void }) {
  const { profile, access, alertLocation, alertRadius, selectAlertLocation, saveAlertRadius,
    savingAlertRadius, locating, locationError } = useCitizen();
  const [notice, setNotice] = useState('');

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

  return <View style={{ gap: spacing.sm }}>
    <SegmentedControl<AlertLocation['source']> label="Alert location" options={profile?.savedAlertLocation ? [gps, saved] : [gps]}
      value={alertLocation?.source ?? null} disabled={locating} onChange={value => {
        onChange?.();
        void selectAlertLocation(value);
      }} />
    {locating && <SupportingText>Finding your current location…</SupportingText>}
    {!!locationError && <SupportingText error>{locationError}</SupportingText>}
    <SegmentedControl label="Alert radius" options={radiusOptions} value={`${alertRadius}`}
      onChange={value => void changeRadius(Number(value) as AlertRadius)} disabled={savingAlertRadius} />
    {!!notice && <SupportingText>{notice}</SupportingText>}
  </View>;
}
