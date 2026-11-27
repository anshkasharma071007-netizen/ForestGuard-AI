import { Circle, CircleCheck, LocateFixed, MapPin } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SupportingText } from '@/components/Feedback';
import { TextAction } from '@/components/TextAction';
import { VillageSelector } from '@/components/VillageSelector';
import { getCurrentCoordinates, LocationPermissionError } from '@/services/device-location';
import type { LocationInput, Village } from '@/services/api';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';

export type LocationChoice = { type: 'gps'; lat: number; lon: number } | { type: 'village'; village: Village };

export function locationInput(value: LocationChoice): LocationInput {
  return value.type === 'gps' ? { lat: value.lat, lon: value.lon } : { village_id: value.village.id };
}

const options = [
  { id: 'gps', label: 'Current location', icon: LocateFixed, detail: 'Use device GPS' },
  { id: 'village', label: 'Choose village', icon: MapPin, detail: 'Use the village center' },
] as const;

export function LocationField({ label, value, onChange, disabled, onLocating }: {
  label: string; value: LocationChoice | null; onChange: (value: LocationChoice | null) => void;
  disabled?: boolean; onLocating: (locating: boolean) => void;
}) {
  const { colors } = useTheme();
  const [method, setMethod] = useState<LocationChoice['type'] | null>(value?.type ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => () => { generation.current += 1; }, []);

  async function capture() {
    const request = ++generation.current;
    const current = () => request === generation.current;
    onChange(null);
    setError('');
    setBusy(true);
    onLocating(true);
    try {
      const point = await getCurrentCoordinates();
      if (current()) onChange({ type: 'gps', ...point });
    } catch (error) {
      if (current()) setError(error instanceof LocationPermissionError ? 'Location permission was denied. You can choose a village.'
        : 'Location could not be captured. Try again or choose a village.');
    } finally {
      if (current()) {
        setBusy(false);
        onLocating(false);
      }
    }
  }

  function select(next: LocationChoice['type']) {
    if (method === next) return;
    generation.current += 1;
    setMethod(next);
    setError('');
    onChange(null);
    if (next === 'gps') void capture();
    else {
      setBusy(false);
      onLocating(false);
    }
  }

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: spacing.sm }}>
      {options.map(({ id, label: name, icon: Icon, detail }) => {
        const selected = id === method;
        const Mark = selected ? CircleCheck : Circle;
        return <View key={id} style={[styles.option, { backgroundColor: selected ? colors.successTint : colors.card,
          borderColor: selected ? colors.focus : colors.border }]}>
          <Pressable accessibilityRole="radio" accessibilityLabel={name} aria-checked={selected}
            accessibilityState={{ checked: selected, disabled }} disabled={disabled}
            onPress={() => select(id)} style={styles.radio}>
            <Icon size={20} color={selected ? colors.accent : colors.secondaryText} />
            <View style={styles.details}>
              <Text style={[typeScale.card, { color: colors.primaryText }]}>{name}</Text>
              <SupportingText>{detail}</SupportingText>
            </View>
            <Mark size={18} color={selected ? colors.accent : colors.mutedText} />
          </Pressable>
          {selected && <View style={[styles.content, { borderTopColor: colors.border }]}>
            {id === 'village' ? <VillageSelector label={label} startOpen={!value}
              selected={value?.type === 'village' ? value.village : null} disabled={disabled}
              onSelect={(village) => onChange({ type: 'village', village })} /> : <>
              {value?.type === 'gps' && <SupportingText>GPS location selected</SupportingText>}
              <TextAction label={busy ? 'Finding location…' : value?.type === 'gps' ? 'Capture again' : 'Retry location'}
                onPress={() => void capture()} loading={busy} disabled={disabled || busy} />
              {!!error && <SupportingText error>{error}</SupportingText>}
            </>}
          </View>}
        </View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 1, borderRadius: radius.input },
  radio: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizing.touch, padding: spacing.md },
  details: { flex: 1, gap: spacing.xs },
  content: { gap: spacing.xs, borderTopWidth: 1, padding: spacing.md },
});
