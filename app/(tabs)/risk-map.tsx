import { View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { radius, spacing, useTheme } from '@/theme';

export default function RiskMapScreen() {
  const { colors } = useTheme();
  return (
    <Screen tab>
      <ScreenHeader title="Map" />
      <View style={{ flexGrow: 1, minHeight: 260, padding: spacing.lg, borderRadius: radius.card,
        backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }}>
        <EmptyState title="Risk map unavailable" />
      </View>
    </Screen>
  );
}
