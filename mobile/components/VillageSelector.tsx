import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { usePublicData } from '@/hooks/usePublicData';
import { getCommunityVillages, type Village } from '@/services/api';
import { spacing } from '@/theme';
import { Dropdown, SelectionRow } from './Controls';
import { Feedback } from './Feedback';

export function VillageSelector({ selected, onSelect, disabled = false, label = 'Village', startOpen = false }: {
  selected: Village | null;
  onSelect: (village: Village) => void;
  disabled?: boolean;
  label?: string;
  startOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(startOpen);
  const [requested, setRequested] = useState(startOpen);
  const { state, reload } = usePublicData(getCommunityVillages, requested);

  return (
    <View style={{ gap: spacing.xs }}>
      <Dropdown label={selected?.name ?? 'Select a village'} accessibilityLabel={`${label}: ${selected?.name ?? 'Select a village'}`}
        icon={MapPin} expanded={expanded} disabled={disabled} onPress={() => {
          setExpanded(!expanded);
          setRequested(true);
        }} />
      {expanded && (
        <View style={{ paddingHorizontal: spacing.xs }}>
          {state.kind === 'loading' && <Feedback title="Loading villages…" kind="loading" />}
          {state.kind === 'unavailable' && <Feedback title="Village selection unavailable" detail={state.message} />}
          {state.kind === 'error' && <Feedback title="Could not load villages" detail={state.message} kind="error" retry={reload} />}
          {state.kind === 'ready' && (state.data.length === 0
            ? <Feedback title="No villages are listed" />
            : state.data.map((village) => (
              <SelectionRow key={village.id} label={village.name} detail={village.center ? village.district : 'Location unavailable'} disabled={disabled || !village.center}
                selected={village.id === selected?.id}
                onPress={() => { if (!disabled) { onSelect(village); setExpanded(false); } }} />
            )))}
        </View>
      )}
    </View>
  );
}
