import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { ApiError, endCitizenSession, getCitizenProfile, updateAlertRadius, updateCitizenProfile, updateSavedAlertLocation,
  verifyCitizen, type CitizenAccess, type CitizenProfile, type Coordinates, type LocationInput } from '@/services/api';
import { getCurrentCoordinates, LocationPermissionError } from '@/services/device-location';
import type { AlertLocation, AlertRadius } from '@/services/nearby-alerts';
import { clearCitizenSubmissions, clearLegacyReferences } from '@/services/report-storage';

const key = 'forest-guard.citizen-session';
const logoutKey = 'forest-guard.citizen-sign-out';
const native = Platform.OS !== 'web';
const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const inactiveSession = new AbortController();
inactiveSession.abort();
const inactiveAccess: CitizenAccess & { signal: AbortSignal } = { signal: inactiveSession.signal, expire: () => {} };

type ActiveSession = {
  profile: CitizenProfile;
  access: CitizenAccess & { signal: AbortSignal };
  controller: AbortController;
  alertLocation: AlertLocation | null;
  gps?: Coordinates;
  alertRadius: AlertRadius;
};

function useSession() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const current = useRef<ActiveSession | null>(null);
  const operation = useRef(false);
  const pendingLogout = useRef<CitizenAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [logoutNotice, setLogoutNotice] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const gpsRequest = useRef<CitizenAccess | null>(null);
  const radiusRequest = useRef<CitizenAccess | null>(null);
  const [savingAlertRadius, setSavingAlertRadius] = useState(false);

  function activate(profile: CitizenProfile, token?: string) {
    const controller = new AbortController();
    const access = { token, citizenId: profile.id, signal: controller.signal, expire: () => {
      if (current.current?.access === access) void signOut();
    } };
    const next: ActiveSession = { profile, access, controller,
      alertLocation: profile.savedAlertLocation ? { source: 'saved' } : null, alertRadius: profile.alertRadiusKm };
    current.current = next;
    setLocating(false);
    setLocationError('');
    setSavingAlertRadius(false);
    setSession(next);
  }

  async function finishLogout(access: CitizenAccess) {
    setLogoutPending(true);
    pendingLogout.current = access;
    let localCleared = false;
    let revoked = false;
    // Persist the intent before touching the HttpOnly cookie or the native credential.
    try {
      await AsyncStorage.setItem(logoutKey, String(access.citizenId ?? ''));
      await Promise.all([
        native ? SecureStore.deleteItemAsync(key, storageOptions) : undefined,
        access.citizenId ? clearCitizenSubmissions(access.citizenId) : undefined,
      ]);
      localCleared = true;
    } catch {
      setLogoutNotice('Could not clear session storage. Retry sign-out.');
    }

    try {
      if (!native || access.token) {
        await endCitizenSession(access);
        revoked = true;
      } else if (localCleared) {
        setLogoutNotice('Local session cleared. Server sign-out could not be confirmed.');
      }
    } catch {
      if (localCleared) setLogoutNotice('Your account is hidden. Server sign-out could not be confirmed.');
    }

    if (localCleared && (revoked || native)) {
      try {
        await AsyncStorage.removeItem(logoutKey);
        pendingLogout.current = null;
        setLogoutPending(false);
        if (revoked) setLogoutNotice('');
      } catch {
        setLogoutNotice('Could not clear session storage. Retry sign-out.');
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setRestoreError('');
    void clearLegacyReferences().catch(() => {});
    async function restore() {
      try {
        const pending = await AsyncStorage.getItem(logoutKey);
        const token = native ? await SecureStore.getItemAsync(key, storageOptions) ?? undefined : undefined;
        if (controller.signal.aborted) return;
        if (pending !== null) {
          const citizenId = Number(pending) || undefined;
          await finishLogout({ token, citizenId, expire: () => {} });
          return;
        }
        if (native && !token) return;
        const profile = await getCitizenProfile({ token, expire: () => {} }, controller.signal);
        if (!controller.signal.aborted) activate(profile, token);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.kind === 'unauthorized') {
          if (native) {
            try { await SecureStore.deleteItemAsync(key, storageOptions); }
            catch { setRestoreError('Could not clear the expired session.'); }
          }
          // Web sign-out also clears an expired or already revoked HttpOnly cookie.
          else await finishLogout({ expire: () => {} });
        } else {
          setRestoreError(error instanceof Error ? error.message : 'Could not restore your session.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void restore();
    return () => controller.abort();
  }, [attempt]);

  async function verify(input: Parameters<typeof verifyCitizen>[0]) {
    if (operation.current || current.current || pendingLogout.current) return;
    operation.current = true;
    try {
      const verified = await verifyCitizen(input);
      if (verified.token) {
        try { await SecureStore.setItemAsync(key, verified.token, storageOptions); }
        catch {
          await endCitizenSession({ token: verified.token, expire: () => {} }).catch(() => {});
          throw new Error('Secure session storage is unavailable on this device.');
        }
      }
      setLogoutNotice('');
      activate(verified.profile, verified.token);
    } finally {
      operation.current = false;
    }
  }

  async function save(input: { name: string; email: string | null; location?: LocationInput }) {
    const active = current.current;
    if (!active) return;
    const profile = await updateCitizenProfile(active.access, input);
    applyLocationProfile(active.access, profile, Boolean(input.location));
  }

  function applyLocationProfile(access: CitizenAccess, profile: CitizenProfile, changedLocation: boolean) {
    const active = current.current;
    if (active?.access !== access) return;
    let alertLocation = active.alertLocation;
    if (changedLocation && alertLocation?.source !== 'gps') {
      alertLocation = profile.savedAlertLocation ? { source: 'saved' } : null;
    }
    const next = { ...active, profile, alertLocation };
    current.current = next;
    setSession(next);
  }

  async function saveLocation(location: LocationInput | null) {
    const active = current.current;
    if (!active) return;
    const profile = await updateSavedAlertLocation(active.access, location);
    applyLocationProfile(active.access, profile, true);
  }

  async function selectAlertLocation(source: AlertLocation['source']) {
    const active = current.current;
    if (!active || gpsRequest.current === active.access) return;
    setLocationError('');
    if (source === 'saved') {
      if (!active.profile.savedAlertLocation) return;
      const next: ActiveSession = { ...active, alertLocation: { source } };
      current.current = next;
      setSession(next);
      return;
    }
    gpsRequest.current = active.access;
    setLocating(true);
    try {
      const point = await getCurrentCoordinates();
      if (current.current?.access !== active.access) return;
      const next: ActiveSession = { ...current.current, gps: point, alertLocation: { source, ...point } };
      current.current = next;
      setSession(next);
    } catch (error) {
      if (current.current?.access === active.access) {
        setLocationError(error instanceof LocationPermissionError
          ? 'Location permission was denied. Allow GPS access or choose a saved location in Profile.'
          : 'Current GPS is unavailable. Try again or choose a saved location in Profile.');
      }
    } finally {
      if (gpsRequest.current === active.access) gpsRequest.current = null;
      if (current.current?.access === active.access) setLocating(false);
    }
  }

  const hasOnboarded = Boolean(session?.profile.location);
  useEffect(() => {
    if (hasOnboarded) void selectAlertLocation('gps');
  }, [hasOnboarded, session?.access]);

  async function saveAlertRadius(radius: AlertRadius) {
    const active = current.current;
    if (!active || radiusRequest.current === active.access) return false;
    radiusRequest.current = active.access;
    setSavingAlertRadius(true);
    const next = { ...active, alertRadius: radius };
    current.current = next;
    setSession(next);
    try {
      const alertRadiusKm = await updateAlertRadius(active.access, radius);
      if (current.current?.access === active.access) {
        const saved = { ...current.current, profile: { ...current.current.profile, alertRadiusKm } };
        current.current = saved;
        setSession(saved);
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unavailable') return false;
      throw error;
    } finally {
      if (radiusRequest.current === active.access) radiusRequest.current = null;
      if (current.current?.access === active.access) setSavingAlertRadius(false);
    }
  }

  async function signOut() {
    if (operation.current) return;
    const active = current.current;
    const access = active
      ? { token: active.access.token, citizenId: active.profile.id, expire: () => {} }
      : pendingLogout.current;
    if (!access) return;
    operation.current = true;
    current.current = null;
    active?.controller.abort();
    setSession(null);
    setLogoutNotice('');
    try { await finishLogout(access); }
    finally { operation.current = false; }
  }

  return {
    profile: session?.profile ?? null, access: session?.access ?? inactiveAccess,
    alertLocation: session?.alertLocation ?? null, gps: session?.gps, selectAlertLocation, locating, locationError,
    alertRadius: session?.alertRadius ?? 25, saveAlertRadius, savingAlertRadius,
    loading, restoreError, retry: () => setAttempt((value) => value + 1),
    logoutNotice, logoutPending, verify, save, saveLocation, signOut,
  };
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
