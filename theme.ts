import { useColorScheme } from 'react-native';
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
    primaryAction: '#0C2418',
    forest: '#0C2418',
    deepForest: '#081A12',
    lime: '#C4E87A',
    moss: '#7FA36B',
    clay: '#B85C38',
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
    primaryAction: '#3B5848',
    forest: '#0C2418',
    deepForest: '#081A12',
    lime: '#C4E87A',
    moss: '#7FA36B',
    clay: '#B85C38',
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
export const typography = {
  heading: 'Georgia',
  body: 'System',
  mono: 'monospace',
};
