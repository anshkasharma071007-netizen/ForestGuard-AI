import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { ApiError, endCitizenSession, getCitizenProfile, updateCitizenProfile, verifyCitizen, type CitizenProfile, type LocationInput } from '@/services/api';

const key = 'forest-guard.citizen-session';
const native = Platform.OS !== 'web';
const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function useSession() {
  const [profile, setProfile] = useState<CitizenProfile | null>(null);
  const [token, setToken] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const expire = useCallback(() => {
    setProfile(null);
    setToken(undefined);
    if (native) void SecureStore.deleteItemAsync(key, storageOptions).catch(() => {});
  }, []);
  const access = useMemo(() => ({ token, expire }), [token, expire]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setRestoreError('');
    async function restore() {
      try {
        const stored = native ? await SecureStore.getItemAsync(key, storageOptions) : undefined;
        if (controller.signal.aborted || (native && !stored)) return;
        const result = await getCitizenProfile({ token: stored ?? undefined, expire: () => {} }, controller.signal);
        if (!controller.signal.aborted) {
          setToken(stored ?? undefined);
          setProfile(result);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.kind === 'unauthorized') expire();
        else setRestoreError(error instanceof Error ? error.message : 'Could not restore your session.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void restore();
    return () => controller.abort();
  }, [attempt, expire]);

  async function verify(input: Parameters<typeof verifyCitizen>[0]) {
    const session = await verifyCitizen(input);
    if (session.token) {
      try { await SecureStore.setItemAsync(key, session.token, storageOptions); }
      catch {
        await endCitizenSession({ token: session.token, expire: () => {} }).catch(() => {});
        throw new Error('Secure session storage is unavailable on this device.');
      }
    }
    setToken(session.token);
    setProfile(session.profile);
  }

  async function save(input: { name: string; email: string | null; location: LocationInput }) {
    setProfile(await updateCitizenProfile(access, input));
  }

  async function signOut() {
    try { await endCitizenSession(access); }
    catch (error) {
      if (!(error instanceof ApiError && error.kind === 'unauthorized')) throw error;
    }
    expire();
  }

  return { profile, access, loading, restoreError, retry: () => setAttempt((value) => value + 1), verify, save, signOut };
}

const CitizenContext = createContext<ReturnType<typeof useSession> | null>(null);

export function CitizenProvider({ children }: PropsWithChildren) {
  return <CitizenContext.Provider value={useSession()}>{children}</CitizenContext.Provider>;
}

export function useCitizen() {
  const context = useContext(CitizenContext);
  if (!context) throw new Error('Citizen session provider is missing.');
  return context;
}
