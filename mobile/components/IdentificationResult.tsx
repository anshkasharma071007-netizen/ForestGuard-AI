import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { CatalogSpecies } from '@/data';
import type { IdentificationState } from '@/identification';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';
import { SectionTitle } from './SectionTitle';

export function IdentificationResult({ state, catalog, activeId, onSelect }: {
  state: IdentificationState;
  catalog: readonly CatalogSpecies[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const { colors } = useTheme();
  if (state.kind === 'idle') return null;
  const messages = {
    analyzing: 'Analyzing photo…',
    detected: 'Review the suggestions and confirm the species below.',
    uncertain: 'Identification is uncertain. Choose a species yourself or use Unknown.',
    'no-detection': 'No animal was detected. You can still submit your report.',
    error: 'The photo could not be analyzed. You can still choose the species.',
  };
  const result = 'result' in state ? state.result : undefined;

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionTitle title="Photo identification" />
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {state.kind === 'analyzing' && <ActivityIndicator color={colors.primaryText} />}
        <Text style={{ ...typeScale.body, color: colors.secondaryText, flex: 1 }}>{messages[state.kind]}</Text>
      </View>
      {result?.animals.map((animal, index) => {
        const label = animal.certainty === 'unsupported' ? 'Species outside the report catalog'
          : catalog.find(({ id }) => id === animal.speciesId)?.label ?? 'Unidentified animal';
        const selected = activeId === animal.id;
        const score = animal.score !== undefined && Number.isFinite(animal.score) && animal.score >= 0 && animal.score <= 1
          ? ` · Model score ${Math.round(animal.score * 100)}%` : '';
        return (
          <Pressable key={animal.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(animal.id)}
            style={{ minHeight: sizing.touch, padding: spacing.md, borderWidth: 1, borderRadius: radius.input,
              borderColor: selected ? colors.focus : colors.border, backgroundColor: selected ? colors.successTint : colors.card }}>
            <Text style={{ ...typeScale.card, color: colors.primaryText }}>Animal {index + 1} · {label}</Text>
            <Text style={{ ...typeScale.supporting, color: colors.secondaryText }}>
              {animal.box ? 'Localized animal' : 'Image classification only'}{animal.certainty === 'uncertain' ? ' · Uncertain' : ''}{score}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
