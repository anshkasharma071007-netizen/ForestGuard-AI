import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
const key = 'forest-guard-ai.appearance';
const ThemeContext = createContext({
  mode: 'system' as ThemeMode,
  ready: false,
  storageError: '',
  setMode: (_mode: ThemeMode) => {},
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, updateMode] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(key).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') updateMode(saved);
    }).catch(() => setStorageError('Saved appearance could not be loaded.')).finally(() => setReady(true));
  }, []);

  const writes = useRef<Promise<void>>(Promise.resolve());

  function setMode(next: ThemeMode) {
    updateMode(next);
    setStorageError('');
    writes.current = writes.current.then(() => AsyncStorage.setItem(key, next))
      .catch(() => setStorageError('Appearance could not be saved.'));
  }

  return <ThemeContext.Provider value={{ mode, ready, storageError, setMode }}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
