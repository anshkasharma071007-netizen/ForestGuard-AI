import { Languages } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '@/i18n';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const options = [{ code: 'en', name: 'English' }, { code: 'hi', name: 'हिन्दी' }] as const;

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  const { colors } = useTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel={t('Language')} style={[styles.group, { borderColor: colors.controlBorder }]}>
    <Languages size={17} color={colors.secondaryText} />
    {options.map(({ code, name }) => <Pressable key={code} accessibilityRole="radio" accessibilityLabel={name}
      accessibilityLanguage={code === 'hi' ? 'hi-IN' : 'en-IN'} accessibilityState={{ checked: language === code }}
      onPress={() => setLanguage(code)} style={[styles.option, language === code && { backgroundColor: colors.primaryAction }]}>
      <Text accessibilityLanguage={code === 'hi' ? 'hi-IN' : 'en-IN'} style={[typeScale.action, { color: language === code ? colors.onAction : colors.primaryText }]}>{name}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderRadius: radius.pill, alignSelf: 'flex-start', flexWrap: 'wrap' },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill },
});
