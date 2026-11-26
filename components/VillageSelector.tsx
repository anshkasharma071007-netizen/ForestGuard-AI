import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getCommunityVillages, isApiConfigured, type Village } from '../services/api';
import { radius, spacing, useTheme } from '../theme';
import { TextAction } from './TextAction';

export function VillageSelector({ selected, onSelect, disabled = false }: {
  selected: Village | null;
  onSelect: (village: Village) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [villages, setVillages] = useState<Village[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setVillages(await getCommunityVillages());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The village list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded, disabled }} disabled={disabled}
        onPress={() => {
          setExpanded(!expanded);
          if (!expanded && !villages && !loading && isApiConfigured) void load();
        }} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.input }]}>
        <Text style={{ flex: 1, color: colors.primaryText, fontSize: 15 }}>{selected?.name ?? 'Select a village'}</Text>
        <ChevronDown size={18} color={colors.primaryText} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
      </Pressable>
      {expanded && (
        <View style={{ paddingVertical: spacing.sm, gap: spacing.xs }}>
          {!isApiConfigured && <Text style={{ color: colors.secondaryText }}>Village selection is unavailable.</Text>}
          {loading && <ActivityIndicator accessibilityLabel="Loading villages" color={colors.primaryText} />}
          {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.clay }}>{error}</Text>}
          {!!error && <TextAction label="Retry village list" onPress={load} disabled={loading || disabled} />}
          {villages?.length === 0 && <Text style={{ color: colors.secondaryText }}>No villages are listed.</Text>}
          {villages?.map((village) => (
            <Pressable key={village.code} accessibilityRole="button" accessibilityState={{ selected: village.code === selected?.code, disabled }}
              disabled={disabled} onPress={() => { onSelect(village); setExpanded(false); }}
              style={[styles.row, { borderColor: colors.border, backgroundColor: village.code === selected?.code ? colors.successTint : colors.card }]}>
              <Text style={{ color: colors.primaryText, fontSize: 15 }}>{village.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.input, padding: spacing.md },
});
