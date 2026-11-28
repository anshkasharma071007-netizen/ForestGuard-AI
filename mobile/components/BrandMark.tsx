import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useLanguage } from '@/i18n';
import { radius, spacing, useTheme } from '../theme';

export function BrandMark({ onHeader = false }: { onHeader?: boolean }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const badge = onHeader ? colors.lime : colors.header;
  const deer = onHeader ? colors.onLime : colors.lime;

  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Van Saathi" style={styles.row}>
      <View style={[styles.badge, { backgroundColor: badge }]}>
        <Svg width={26} height={26} viewBox="0 0 36 36">
          <Path
            d="M14 13.5C13.4 9.8 11.6 7.4 8.6 5.6M12 9.4C9.8 8.2 7.6 8.2 5.6 9.2M22 13.5C22.6 9.8 24.4 7.4 27.4 5.6M24 9.4C26.2 8.2 28.4 8.2 30.4 9.2"
            stroke={deer} strokeWidth={1.6} strokeLinecap="round" fill="none"
          />
          <Path
            d="M13.4 12.6c-1.9-1.2-4.2-1.2-5.6.2 1 1.7 3.1 2.4 4.9 2.1zM22.6 12.6c1.9-1.2 4.2-1.2 5.6.2-1 1.7-3.1 2.4-4.9 2.1z"
            fill={deer}
          />
          <Path
            d="M12.6 15.1c0-2.5 2.4-4.5 5.4-4.5s5.4 2 5.4 4.5c0 5.4-2.7 9.7-5.4 9.7s-5.4-4.3-5.4-9.7z"
            fill={deer}
          />
          <Circle cx="15.4" cy="16.2" r=".95" fill={badge} />
          <Circle cx="20.6" cy="16.2" r=".95" fill={badge} />
          <Path
            d="M18 20.6c-1.5 0-2.5 1-2.5 2.1 0 1.2 1.1 2 2.5 2s2.5-.8 2.5-2c0-1.1-1-2.1-2.5-2.1z"
            fill={badge} opacity={0.5}
          />
        </Svg>
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.wordmark, { color: onHeader ? colors.onHeader : colors.primaryText }]}>
          Van <Text style={{ color: onHeader ? colors.lime : colors.accent }}>Saathi</Text>
        </Text>
        <Text numberOfLines={1} style={[styles.tagline, { color: onHeader ? 'rgba(233,244,222,0.72)' : colors.mutedText }]}>
          {t('Conservation intelligence')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { width: 36, height: 36, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1, justifyContent: 'center' },
  wordmark: { fontFamily: 'Manrope-Semibold', fontSize: 19, lineHeight: 23, letterSpacing: -0.2 },
  tagline: {
    fontFamily: 'Inter-Regular', fontSize: 8.5, lineHeight: 12, letterSpacing: 1.9,
    textTransform: 'uppercase', marginTop: 1,
  },
});