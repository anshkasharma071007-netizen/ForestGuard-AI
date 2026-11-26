import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, sizing, spacing, typography, useTheme } from '../theme';

export function BrandMark({ fontReady = true }: { fontReady?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: colors.lime }]}>
        <Svg width={24} height={24} viewBox="0 0 32 32" accessible={false}>
          <Path d="M16 4c4.5 3.6 8 8 8 13a8 8 0 0 1-16 0c0-5 3.5-9.4 8-13z" fill={colors.deepForest} opacity={0.95} />
          <Path d="M16 9.5v14M16 14.5l-4-3.5M16 18l4-3.5" stroke={colors.forest} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      </View>
      <Text accessibilityRole="header" style={[styles.name, { color: colors.primaryText, fontFamily: fontReady ? typography.brand : undefined }]}>Forest Guard AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: { width: sizing.brandMark, height: sizing.brandMark, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  name: { flexShrink: 1, fontSize: 20, lineHeight: 26 },
});
