import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { spacing, useTheme } from '@/theme';

const points = [
  'Keep a safe distance from all wildlife.',
  'Avoid forest edges, stream crossings and isolated paths after dusk.',
  'Do not feed, chase, corner or shine lights at animals.',
  'Keep children and livestock close to the settlement.',
  'Call the local forest office if a wild animal enters a lived-in area.',
];

export default function GuidelinesScreen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <ScreenHeader title="Safety guidelines" back />
      <View style={styles.list}>
        {points.map((point) => (
          <View key={point} style={styles.row}>
            <Text style={{ color: colors.primaryText }}>•</Text>
            <Text style={[styles.point, { color: colors.primaryText }]}>{point}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' },
  point: { flex: 1, fontSize: 16, lineHeight: 23 },
});
