import * as Location from 'expo-location';
import { LocateFixed, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { SegmentedControl } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { TextAction } from '@/components/TextAction';
import { VillageSelector } from '@/components/VillageSelector';
import type { LocationInput, Village } from '@/services/api';
import { spacing } from '@/theme';

export type LocationChoice = { type: 'gps'; lat: number; lon: number } | { type: 'village'; village: Village };

export function locationInput(value: LocationChoice): LocationInput {
  return value.type === 'gps' ? { lat: value.lat, lon: value.lon } : { village_code: value.village.code };
}

const options = [
  { id: 'gps', label: 'Current location', icon: LocateFixed },
  { id: 'village', label: 'Choose village', icon: MapPin },
] as const;

export function LocationField({ label, value, onChange, disabled, onLocating }: {
  label: string; value: LocationChoice | null; onChange: (value: LocationChoice | null) => void;
  disabled?: boolean; onLocating: (locating: boolean) => void;
}) {
  const [method, setMethod] = useState<LocationChoice['type'] | null>(value?.type ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function capture() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError('');
    setBusy(true);
    onLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Location permission was denied. You can choose a village.');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) throw new Error('Location services disabled.');
      const { coords } = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timed out.')), 12000); }),
      ]);
      onChange({ type: 'gps', lat: coords.latitude, lon: coords.longitude });
    } catch {
      setError('Location could not be captured. Try again or choose a village.');
    } finally {
      clearTimeout(timer);
      setBusy(false);
      onLocating(false);
    }
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <SegmentedControl label={label} options={options} value={method} disabled={disabled || busy} onChange={(next) => {
        if (method === next) return;
        setMethod(next);
        setError('');
        onChange(null);
        if (next === 'gps') void capture();
      }} />
      {method === 'gps' && (
        <>
          {value?.type === 'gps' && <SupportingText>GPS location selected</SupportingText>}
          <TextAction label={busy ? 'Finding location…' : value?.type === 'gps' ? 'Capture again' : 'Retry location'}
            onPress={() => void capture()} loading={busy} disabled={disabled || busy} />
          {!!error && <SupportingText error>{error}</SupportingText>}
        </>
      )}
      {method === 'village' && <VillageSelector startOpen={!value} label={label}
        selected={value?.type === 'village' ? value.village : null} disabled={disabled}
        onSelect={(village) => onChange({ type: 'village', village })} />}
    </View>
  );
}
