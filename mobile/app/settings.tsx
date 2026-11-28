import { useLanguage } from '@/i18n';
import { StyleSheet, View } from 'react-native';
import { SelectionRow } from '@/components/Controls';
import { Feedback, StatusPill, SupportingText } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { Surface } from '@/components/Surface';
import { TextAction } from '@/components/TextAction';
import { usePublicData } from '@/hooks/usePublicData';
import { getBackendHealth } from '@/services/api';
import { spacing } from '@/theme';
import { useAppTheme } from '@/theme-context';

const options = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
] as const;

export default function SettingsScreen() {
  const { t, errorText } = useLanguage();
  const { mode, setMode, storageError } = useAppTheme();
  const health = usePublicData(getBackendHealth);

  return (
    <Screen header={<ScreenHeader title={t('Appearance')} back />}>
      <Surface style={styles.section}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Appearance')}>
          {options.map(({ id, label }) => <SelectionRow key={id} label={t(label)} selected={mode === id} onPress={() => setMode(id)} />)}
        </View>
        {!!storageError && <SupportingText error>{storageError}</SupportingText>}
      </Surface>
      <Surface style={styles.section}>
        <SectionTitle title={t('Service status')} />
        {health.state.kind === 'loading' && <Feedback title={t('Checking service…')} kind="loading" />}
        {health.state.kind === 'unavailable' && <Feedback title={t('Service check unavailable')} detail={errorText(health.state.message)} />}
        {health.state.kind === 'error' && <Feedback title={t('Service check failed')} detail={health.state.message} kind="error" retry={health.reload} />}
        {health.state.kind === 'ready' && (
          <>
            <StatusPill label={health.state.data.status === 'ok' ? t('Service reachable') : t('Service degraded')}
              tone={health.state.data.status === 'ok' ? 'success' : 'warning'} />
            {health.state.data.demoMode && <SupportingText>{t('The server reports demonstration mode.')}</SupportingText>}
            <View style={{ alignItems: 'flex-start' }}><TextAction label={t('Check again')} onPress={health.reload} /></View>
          </>
        )}
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.xl },
});
