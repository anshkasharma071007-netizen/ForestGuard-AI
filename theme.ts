import { Platform, useColorScheme } from 'react-native';
import { useAppTheme } from './theme-context';

export const palette = {
  light: {
    background: '#F4F1E8',
    card: '#FBFAF5',
    input: '#FFFFFF',
    primaryText: '#17211B',
    secondaryText: '#374038',
    mutedText: '#656B64',
    border: '#E4DFD1',
    controlBorder: '#A09883',
    focus: '#3F6B51',
    primaryAction: '#0C2418',
    onAction: '#F7F8F1',
    tabInactive: '#AAB8AD',
    forest: '#0C2418',
    deepForest: '#081A12',
    lime: '#C4E87A',
    moss: '#7FA36B',
    clay: '#943F27',
    amber: '#D9A441',
    successTint: '#E3EEDB',
    warningTint: '#F5E9C9',
    dangerTint: '#F4DED6',
  },
  dark: {
    background: '#171F1B',
    card: '#1F2A24',
    input: '#27342D',
    primaryText: '#E1E8DF',
    secondaryText: '#C2CDC2',
    mutedText: '#AAB8AD',
    border: '#3B4B41',
    controlBorder: '#63766A',
    focus: '#ADCCA9',
    primaryAction: '#3B5848',
    onAction: '#F7F8F1',
    tabInactive: '#AAB8AD',
    forest: '#0C2418',
    deepForest: '#081A12',
    lime: '#C4E87A',
    moss: '#7FA36B',
    clay: '#F0A88F',
    amber: '#D9A441',
    successTint: '#31432F',
    warningTint: '#4A3E23',
    dangerTint: '#4A3028',
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
export const sizing = { touch: 48, button: 52, icon: 22, brandMark: 40, content: 680 };
export const typography = {
  heading: Platform.select({ web: 'Fraunces, Georgia, serif', android: 'serif', default: 'Georgia' }),
  mono: Platform.select({ web: 'JetBrains Mono, monospace', ios: 'Menlo', default: 'monospace' }),
  body: Platform.select({ web: 'Inter, system-ui, sans-serif' }),
};
export const typeScale = {
  screen: { fontFamily: typography.heading, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  section: { fontFamily: typography.heading, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  card: { fontFamily: typography.body, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: typography.body, fontSize: 15, lineHeight: 22 },
  supporting: { fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  action: { fontFamily: typography.body, fontSize: 15, lineHeight: 22, fontWeight: '600' },
} as const;

export const photoViewerColors = { backdrop: '#08120D', imageMatte: '#040806', foreground: '#FBFAF5', outline: '#809386' };
