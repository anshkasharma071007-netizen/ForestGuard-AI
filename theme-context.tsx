import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
type ThemeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextValue>({ mode: 'system', setMode: () => undefined });

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>('system');
  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
