import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { spacing, radius, useTheme } from '@/theme';
import { useAppTheme } from '@/theme-context';

const options = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
] as const;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { mode, setMode, storageError } = useAppTheme();

  return (
    <Screen>
      <ScreenHeader title="Settings" back />
      <View style={styles.section}>
        <SectionTitle title="Appearance" />
        <View accessibilityRole="radiogroup" style={styles.options}>
          {options.map(({ id, label }) => (
            <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: mode === id }}
              onPress={() => setMode(id)}
              style={[styles.option, { backgroundColor: mode === id ? colors.successTint : colors.card, borderColor: colors.border }]}>
              <Text style={{ color: colors.primaryText, fontSize: 15, fontWeight: mode === id ? '700' : '400' }}>{label}</Text>
              {mode === id && <Text style={{ color: colors.secondaryText }}>Selected</Text>}
            </Pressable>
          ))}
        </View>
        {!!storageError && <Text accessibilityLiveRegion="polite" style={{ color: colors.clay }}>{storageError}</Text>}
      </View>
      <View style={styles.section}>
        <SectionTitle title="About" />
        <Text style={{ color: colors.primaryText, fontSize: 15 }}>Forest Guard AI</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  options: { gap: spacing.xs },
  option: { minHeight: 48, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: radius.input },
});
