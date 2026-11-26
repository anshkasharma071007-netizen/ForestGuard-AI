import { ChevronDown, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type CatalogSpecies, unknownSpecies } from '@/data';
import type { AnimalPrediction } from '@/identification';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';
import { PrimaryButton } from './PrimaryButton';
import { TextAction } from './TextAction';

export type SpeciesSelection = { species: CatalogSpecies; customName?: string };

export function SpeciesSelector({ catalog, selection, prediction, disabled, onSelect }: {
  catalog: readonly CatalogSpecies[];
  selection: SpeciesSelection;
  prediction?: AnimalPrediction;
  disabled: boolean;
  onSelect: (selection: SpeciesSelection) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editingOther, setEditingOther] = useState(false);
  const [custom, setCustom] = useState('');
  const display = selection.customName ? `Other: ${selection.customName}` : selection.species.label;
  const matches = (value: CatalogSpecies) => `${value.label} ${value.id.replace(/_/g, ' ')}`.toLowerCase().includes(query.trim().toLowerCase());
  const detectedId = prediction?.certainty === 'detected' ? prediction.speciesId : null;
  const suggestions = new Map<string, string>();
  if (detectedId) suggestions.set(detectedId, 'AI suggestion');
  prediction?.alternatives.forEach(({ speciesId }) => {
    if (!suggestions.has(speciesId)) suggestions.set(speciesId, 'AI alternative');
  });
  // Only catalogue IDs are selectable, even when a model recognizes something outside the catalogue.
  const suggested = Array.from(suggestions.keys()).flatMap((id) => {
    const species = catalog.find((item) => item.id === id);
    return species && matches(species) ? [species] : [];
  });
  const remaining = catalog.filter((item) => !suggestions.has(item.id) && matches(item));

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function choose(species: CatalogSpecies, customName?: string) {
    onSelect({ species, customName });
    setOpen(false);
  }

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Species: ${display}`} accessibilityState={{ disabled, expanded: open }}
        disabled={disabled} onPress={() => {
          setQuery('');
          setCustom(selection.customName ?? '');
          setEditingOther(!!selection.customName);
          setOpen(true);
        }} style={[styles.row, { borderColor: colors.controlBorder, backgroundColor: colors.input }]}>
        <Text style={{ ...typeScale.body, color: colors.primaryText, flex: 1 }}>{display}</Text>
        <ChevronDown size={sizing.icon} color={colors.primaryText} />
      </Pressable>
      {open && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} accessibilityViewIsModal>
            <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.header}>
                <Text accessibilityRole="header" style={{ ...typeScale.screen, color: colors.primaryText, flex: 1 }}>Select species</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close species selector" style={styles.iconButton} onPress={() => setOpen(false)}>
                  <X size={sizing.icon} color={colors.primaryText} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
                {editingOther ? (
                  <>
                    <Text style={{ ...typeScale.card, color: colors.primaryText }}>Enter a species name</Text>
                    <Text style={{ ...typeScale.body, color: colors.secondaryText }}>
                      The report will use Unknown for its species. Your name for the animal will be included in the description.
                    </Text>
                    <TextInput accessibilityLabel="Custom species name" value={custom} maxLength={80} onChangeText={setCustom}
                      placeholder="Species name" placeholderTextColor={colors.mutedText}
                      style={[styles.row, styles.input, { borderColor: colors.controlBorder, color: colors.primaryText, backgroundColor: colors.input }]} />
                    <PrimaryButton label="Use Unknown and include name" disabled={!custom.trim()}
                      onPress={() => choose(unknownSpecies, custom.trim().replace(/\s+/g, ' '))} />
                    <TextAction label="Back to species list" onPress={() => setEditingOther(false)} />
                  </>
                ) : (
                  <>
                    <View style={[styles.row, { borderColor: colors.controlBorder, backgroundColor: colors.input }]}>
                      <Search size={18} color={colors.mutedText} />
                      <TextInput accessibilityLabel="Search species" value={query} onChangeText={setQuery} autoCorrect={false}
                        placeholder="Search species" placeholderTextColor={colors.mutedText} returnKeyType="search"
                        style={[styles.search, { color: colors.primaryText }]} />
                      {!!query && (
                        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" style={styles.iconButton} onPress={() => setQuery('')}>
                          <X size={18} color={colors.primaryText} />
                        </Pressable>
                      )}
                    </View>
                    {[...suggested, ...remaining].map((species) => (
                      <SpeciesRow key={species.id} label={species.label} subtitle={suggestions.get(species.id)}
                        selected={selection.species.id === species.id} onPress={() => choose(species)} />
                    ))}
                    {query.trim() && suggested.length + remaining.length === 0 ?
                      <Text accessibilityLiveRegion="polite" style={{ ...typeScale.body, color: colors.secondaryText }}>No catalog species match that search.</Text> : null}
                    <SpeciesRow label="Unknown" selected={selection.species.id === unknownSpecies.id && !selection.customName}
                      onPress={() => choose(unknownSpecies)} />
                    <SpeciesRow label="Other" subtitle="Enter a species name for the description" selected={!!selection.customName}
                      onPress={() => { setCustom(selection.customName ?? ''); setEditingOther(true); }} />
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}
    </>
  );
}

function SpeciesRow({ label, subtitle, selected, onPress }: { label: string; subtitle?: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[styles.row, { borderColor: selected ? colors.focus : colors.border, backgroundColor: selected ? colors.successTint : colors.card }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ ...typeScale.card, color: colors.primaryText }}>{label}</Text>
        {subtitle && <Text style={{ ...typeScale.supporting, color: colors.secondaryText }}>{subtitle}</Text>}
      </View>
      {selected && <Text style={{ ...typeScale.supporting, color: colors.primaryText }}>Selected</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, width: '100%', maxWidth: sizing.content, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: { minHeight: sizing.touch, borderWidth: 1, borderRadius: radius.input, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  iconButton: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center' },
  input: { ...typeScale.body, fontSize: 16 },
  search: { ...typeScale.body, fontSize: 16, flex: 1, minHeight: sizing.touch },
});
