import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type CatalogSpecies, unknownSpecies } from '@/data';
import type { AnimalPrediction } from '@/identification';
import { sizing, spacing, typeScale, useTheme } from '@/theme';
import { Dropdown, InputField, SelectionRow } from './Controls';
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
      <Dropdown label={display} accessibilityLabel={`Species: ${display}`} disabled={disabled} expanded={open}
        onPress={() => {
          setQuery('');
          setCustom(selection.customName ?? '');
          setEditingOther(!!selection.customName);
          setOpen(true);
        }} />
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
                    <Text style={{ ...typeScale.body, color: colors.secondaryText }}>
                      The report will use Unknown for its species. Your name for the animal will be included in the description.
                    </Text>
                    <InputField label="Species name" value={custom} maxLength={80} onChangeText={setCustom} />
                    <PrimaryButton label="Use Unknown and include name" disabled={!custom.trim()}
                      onPress={() => choose(unknownSpecies, custom.trim().replace(/\s+/g, ' '))} />
                    <TextAction label="Back to species list" onPress={() => setEditingOther(false)} />
                  </>
                ) : (
                  <>
                    <InputField label="Search species" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
                    {!!query && <View style={{ alignItems: 'flex-start' }}>
                      <TextAction label="Clear search" onPress={() => setQuery('')} />
                    </View>}
                    {[...suggested, ...remaining].map((species) => (
                      <SelectionRow key={species.id} label={species.label} detail={suggestions.get(species.id)}
                        selected={selection.species.id === species.id} onPress={() => choose(species)} />
                    ))}
                    {query.trim() && suggested.length + remaining.length === 0 ?
                      <Text accessibilityLiveRegion="polite" style={{ ...typeScale.body, color: colors.secondaryText }}>No catalog species match that search.</Text> : null}
                    <SelectionRow label="Unknown" selected={selection.species.id === unknownSpecies.id && !selection.customName}
                      onPress={() => choose(unknownSpecies)} />
                    <SelectionRow label="Other" detail="Enter a species name for the description" selected={!!selection.customName}
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

const styles = StyleSheet.create({
  shell: { flex: 1, width: '100%', maxWidth: sizing.content, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.sm },
  iconButton: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center' },
});
