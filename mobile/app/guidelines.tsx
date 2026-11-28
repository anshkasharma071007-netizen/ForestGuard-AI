import { useLanguage } from '@/i18n';
import { StyleSheet, Text, View } from 'react-native';
import { SupportingText } from '@/components/Feedback';
import { usePublicData } from '@/hooks/usePublicData';
import { getCommunityGuidance } from '@/services/api';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/SectionTitle';
import { Surface } from '@/components/Surface';
import { ScreenHeader } from '@/components/ScreenHeader';
import { spacing, typeScale, useTheme } from '@/theme';

const points = [
  'Keep a safe distance from all wildlife.',
  'Avoid forest edges, stream crossings and isolated paths after dusk.',
  'Do not feed, chase, corner or shine lights at animals.',
  'Keep children and livestock close to the settlement.',
  'Call the local forest office if a wild animal enters a lived-in area.',
];

export default function GuidelinesScreen() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const { state } = usePublicData(getCommunityGuidance);
  const guidance = state.kind === 'ready' && state.data.general.length ? state.data : null;
  return (
    <Screen header={<ScreenHeader title={t('Privacy and safety')} back />}>
      <Surface style={styles.list}>
        <SectionTitle title={t('Location and photo privacy')} />
        <SupportingText>{t('Public alerts use approximate report areas. Submitted photographs are available to the reporting account and authorized reviewers.')}</SupportingText>
      </Surface>
      <Surface style={styles.list}>
        <SectionTitle title={t('Wildlife safety guidelines')} />
        <SupportingText>{t(guidance?.sourceNote ?? 'General precautions. Follow instructions from your local forest authorities.')}</SupportingText>
        {(guidance?.general ?? points).map((point) => (
          <View key={point} style={styles.row}>
            <Text style={{ color: colors.primaryText }}>•</Text>
            <Text style={[styles.point, { color: colors.primaryText }]}>{t(point)}</Text>
          </View>
        ))}
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' },
  point: { flex: 1, ...typeScale.body },
});
