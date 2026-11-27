import { ArrowLeft, CircleHelp, Ellipsis } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type CatalogSpecies, otherSpecies, unknownSpecies } from '@/data';
import type { AnimalPrediction } from '@/identification';
import { sizing, spacing, typeScale, useTheme } from '@/theme';
import { Dropdown, InputField, SelectionRow } from './Controls';

export function SpeciesSelector({ catalog, selection, prediction, disabled, onSelect }: {
  catalog: readonly CatalogSpecies[];
  selection: CatalogSpecies;
  prediction?: AnimalPrediction;
  disabled: boolean;
  onSelect: (selection: CatalogSpecies) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const matches = catalog.filter(({ id, label }) => `${label} ${id.replace(/_/g, ' ')}`.toLowerCase().includes(search));
  const detectedId = prediction?.certainty === 'detected' ? prediction.speciesId : null;

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function choose(animal: CatalogSpecies) {
    onSelect(animal);
    setOpen(false);
  }

  return (
    <>
      <Dropdown label={selection.label} accessibilityLabel={`Animal: ${selection.label}`} disabled={disabled} expanded={open}
        onPress={() => { setQuery(''); setOpen(true); }} />
      {open && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} accessibilityViewIsModal>
          <KeyboardAvoidingView style={styles.shell} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.header}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close animal selector" style={styles.iconButton} onPress={() => setOpen(false)}>
                <ArrowLeft size={sizing.icon} color={colors.primaryText} />
              </Pressable>
              <Text accessibilityRole="header" style={[typeScale.screen, { color: colors.primaryText }]}>Select animal</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
              <InputField label="Search animals" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
              <Text accessibilityRole="header" style={[typeScale.card, { color: colors.secondaryText }]}>Recognized animals</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Recognized animals" style={styles.options}>
                {matches.map((animal) => (
                  <SelectionRow key={animal.id} label={animal.label} detail={detectedId === animal.id ? 'AI suggestion' : undefined}
                    selected={selection.id === animal.id} surface onPress={() => choose(animal)} />
                ))}
              </View>
              {matches.length === 0 && <Text accessibilityLiveRegion="polite" style={[typeScale.body, { color: colors.secondaryText }]}>No matching animals</Text>}
              <View accessibilityRole="radiogroup" accessibilityLabel="Other options" style={[styles.other, { borderColor: colors.border }]}>
                <Text accessibilityRole="header" style={[typeScale.card, { color: colors.secondaryText }]}>Other options</Text>
                <SelectionRow label="Unknown" detail="I couldn’t identify the animal" icon={CircleHelp}
                  selected={selection.id === unknownSpecies.id} surface onPress={() => choose(unknownSpecies)} />
                <SelectionRow label="Other" detail="The animal isn’t listed" icon={Ellipsis}
                  selected={selection.id === otherSpecies.id} surface onPress={() => choose(otherSpecies)} />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>}
    </>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, width: '100%', maxWidth: sizing.content, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  options: { gap: spacing.sm },
  other: { borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.lg, gap: spacing.sm },
  iconButton: { minWidth: sizing.touch, minHeight: sizing.touch, alignItems: 'center', justifyContent: 'center' },
});
