import { Image, StyleSheet, View } from 'react-native';
import { palette, radius, sizing, useTheme } from '../theme';

export function BrandMark({ onHeader = false }: { onHeader?: boolean }) {
  const { isDark } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Forest Guard AI"
      style={[styles.mark, (isDark || onHeader) && styles.brandSurface]}
    >
      <Image
        source={require('../assets/images/forest-guard-wordmark.png')}
        resizeMode="contain"
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { flexShrink: 1, borderRadius: radius.input },
  brandSurface: { backgroundColor: palette.light.card, paddingHorizontal: 8 },
  image: { width: 154, maxWidth: '100%', height: sizing.brandMark },
});
