import { Platform, useColorScheme } from 'react-native';
import { useAppTheme } from './theme-context';

export const palette = {
  light: {
    background: '#F5F2EA',
    card: '#FBF9F4',
    input: '#FFFDF8',
    primaryText: '#17271E',
    secondaryText: '#445548',
    mutedText: '#526456',
    border: '#DADFD2',
    controlBorder: '#839082',
    focus: '#54765B',
    accent: '#294332',
    successText: '#335B3B',
    warning: '#B17B35',
    warningText: '#754B1B',
    infoText: '#315B71',
    primaryAction: '#294332',
    onAction: '#FBF9F4',
    header: '#294332',
    onHeader: '#FBF9F4',
    softAccent: '#DDE4D2',
    clay: '#9B4032',
    successTint: '#DDE4D2',
    warningTint: '#F1E3CB',
    dangerTint: '#F1DDD6',
  },
  dark: {
    background: '#1B241F',
    card: '#28352C',
    input: '#303F34',
    primaryText: '#F0EDE4',
    secondaryText: '#D0D8CB',
    mutedText: '#B5C3B4',
    border: '#435648',
    controlBorder: '#7F9782',
    focus: '#A8C39F',
    accent: '#A8C39F',
    successText: '#B9D2AF',
    warning: '#D4A35D',
    warningText: '#EBC18B',
    infoText: '#A8CDE1',
    primaryAction: '#819C77',
    onAction: '#17271E',
    header: '#28352C',
    onHeader: '#F0EDE4',
    softAccent: '#394B3C',
    clay: '#F0AA98',
    successTint: '#394B3C',
    warningTint: '#4A3927',
    dangerTint: '#513630',
  },
} as const;

export type Theme = { [Key in keyof typeof palette.light]: string };

export function useTheme(): { colors: Theme; isDark: boolean } {
  const systemScheme = useColorScheme();
  const contextTheme = useAppTheme();
  const isDark = contextTheme.mode === 'system' ? systemScheme === 'dark' : contextTheme.mode === 'dark';
  return { colors: isDark ? palette.dark : palette.light, isDark };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { input: 12, card: 16, pill: 999 };
export const sizing = { touch: 48, button: 52, icon: 22, brandMark: 42, content: 680 };

const font = (family: string) => Platform.OS === 'web'
  ? `"${family}", "Noto Sans Devanagari", system-ui, sans-serif` : family;

export const typography = {
  heading: font('Manrope-Semibold'),
  body: font('Inter-Regular'),
  strong: font('Inter-Semibold'),
  mono: Platform.select({ web: 'monospace', ios: 'Menlo', default: 'monospace' }),
};
export const typeScale = {
  screen: { fontFamily: typography.heading, fontSize: 26, lineHeight: 33 },
  header: { fontFamily: typography.heading, fontSize: 21, lineHeight: 28 },
  section: { fontFamily: typography.heading, fontSize: 19, lineHeight: 25 },
  card: { fontFamily: typography.heading, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: typography.body, fontSize: 15, lineHeight: 22 },
  supporting: { fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  action: { fontFamily: typography.strong, fontSize: 14, lineHeight: 20 },
  input: { fontFamily: typography.body, fontSize: 16, lineHeight: 22 },
} as const;

export const photoViewerColors = {
  backdrop: '#15241C', imageMatte: '#101A14', foreground: '#FBF9F4', outline: '#9CAE9C',
  annotation: '#E6C78C', onAnnotation: '#17271E',
};
