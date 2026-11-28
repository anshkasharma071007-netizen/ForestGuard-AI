import { Platform, useColorScheme, type ViewStyle } from 'react-native';
import { useAppTheme } from './theme-context';

export const palette = {
  light: {
    background: '#FAF6EC',
    card: '#FFFCF5',
    input: '#FFFEFA',
    primaryText: '#17241B',
    secondaryText: '#44554A',
    mutedText: '#526456',
    border: '#E7DFCE',
    controlBorder: '#8B988A',
    focus: '#2A7048',
    accent: '#1F5C3A',
    successText: '#2A7048',
    warning: '#C68A1E',
    warningText: '#7A5A10',
    infoText: '#315B71',
    primaryAction: '#1F5C3A',
    onAction: '#F6FBEE',
    header: '#0E3323',
    onHeader: '#F3FAE8',
    softAccent: '#E6F2E4',
    clay: '#B3362A',
    successTint: '#E6F2E4',
    warningTint: '#FAEECB',
    dangerTint: '#F8E2DB',
    headerFrom: '#0B2B1D',
    headerTo: '#1F5C3A',
    actionFrom: '#1F5C3A',
    actionTo: '#2E7A50',
    lime: '#CFE8A3',
    onLime: '#0B2B1D',
  },
  dark: {
    background: '#0F1912',
    card: '#16231A',
    input: '#1B2A20',
    primaryText: '#E9F1E2',
    secondaryText: '#C3D2C0',
    mutedText: '#A7B8A5',
    border: '#2C4033',
    controlBorder: '#5B7364',
    focus: '#B7D9A9',
    accent: '#CFE8A3',
    successText: '#B7D9A9',
    warning: '#E0A32E',
    warningText: '#E7C585',
    infoText: '#A4CBE0',
    primaryAction: '#3D6B4E',
    onAction: '#F4FAEA',
    header: '#0B1D14',
    onHeader: '#EAF4DE',
    softAccent: '#23382A',
    clay: '#F0B5A3',
    successTint: '#21352A',
    warningTint: '#3A3223',
    dangerTint: '#3E2620',
    headerFrom: '#081710',
    headerTo: '#123D2A',
    actionFrom: '#2C5A40',
    actionTo: '#3D7A54',
    lime: '#CFE8A3',
    onLime: '#0B2B1D',
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

const elevationStyle = (web: string, native: ViewStyle): ViewStyle =>
  Platform.OS === 'web' ? { boxShadow: web } : native;

export const elevation = {
  subtle: elevationStyle('0 4px 12px -8px rgba(11,43,29,0.35)', {
    shadowColor: '#0B2B1D', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  }),
  card: elevationStyle('0 10px 26px -18px rgba(11,43,29,0.5)', {
    shadowColor: '#0B2B1D', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  }),
  raised: elevationStyle('0 16px 34px -20px rgba(11,43,29,0.6)', {
    shadowColor: '#0B2B1D', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6,
  }),
};

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
  backdrop: '#0B1D14', imageMatte: '#08130D', foreground: '#F6FBEE', outline: '#9CAE9C',
  annotation: '#E6C78C', onAnnotation: '#17271E',
};