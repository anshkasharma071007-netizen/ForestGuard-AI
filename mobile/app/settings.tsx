import { StyleSheet, View } from 'react-native';
import { SelectionRow } from '@/components/Controls';
import { Feedback, StatusPill, SupportingText } from '@/components/Feedback';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
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
  const { mode, setMode, storageError } = useAppTheme();
  const health = usePublicData(getBackendHealth);

  return (
    <Screen>
      <ScreenHeader title="Settings" back />
      <View style={styles.section}>
        <SectionTitle title="Appearance" />
        <View accessibilityRole="radiogroup" accessibilityLabel="Appearance">
          {options.map(({ id, label }) => <SelectionRow key={id} label={label} selected={mode === id} onPress={() => setMode(id)} />)}
        </View>
        {!!storageError && <SupportingText error>{storageError}</SupportingText>}
      </View>
      <View style={styles.section}>
        <SectionTitle title="Service status" />
        {health.state.kind === 'loading' && <Feedback title="Checking service…" kind="loading" />}
        {health.state.kind === 'unavailable' && <Feedback title="Service check unavailable" detail={health.state.message} />}
        {health.state.kind === 'error' && <Feedback title="Service check failed" detail={health.state.message} kind="error" retry={health.reload} />}
        {health.state.kind === 'ready' && (
          <>
            <StatusPill label={health.state.data.status === 'ok' ? 'Service reachable' : 'Service degraded'}
              tone={health.state.data.status === 'ok' ? 'success' : 'warning'} />
            {health.state.data.demoMode && <SupportingText>The server reports demonstration mode.</SupportingText>}
            <View style={{ alignItems: 'flex-start' }}><TextAction label="Check again" onPress={health.reload} /></View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.xl },
});
