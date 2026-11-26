import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from 'expo';
import { Platform } from 'react-native';
import { recoverCitizenReceipt, type CitizenAccess } from './api';

const legacyKey = 'forest-guard-ai.report-references';
const citizenPrefix = (id: number) => `forest-guard.citizen-drafts.${id}.`;

function newKey() {
  if (Platform.OS !== 'web' || typeof crypto.randomUUID === 'function') return uuid.v4();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

let pendingWrite = Promise.resolve();

function write<T>(operation: () => Promise<T>): Promise<T> {
  const next = pendingWrite.then(operation);
  pendingWrite = next.then(() => undefined, () => undefined);
  return next;
}

// Store only a salted fingerprint and a retry key, scoped to the active citizen.
export function submissionKey(draft: string, citizenId: number, signal: AbortSignal) {
  return write(async () => {
    if (signal.aborted) throw new Error('Sign in again to submit a report.');
    const prefix = citizenPrefix(citizenId);
    for (const storageKey of (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix))) {
      const key = storageKey.slice(prefix.length);
      if (await AsyncStorage.getItem(storageKey) === uuid.v5(draft, key)) return key;
    }
    if (signal.aborted) throw new Error('Sign in again to submit a report.');
    const key = newKey();
    await AsyncStorage.setItem(prefix + key, uuid.v5(draft, key));
    return key;
  });
}

export function finishSubmission(key: string, citizenId: number) {
  return AsyncStorage.removeItem(citizenPrefix(citizenId) + key);
}

export function clearCitizenSubmissions(citizenId: number) {
  return write(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(citizenPrefix(citizenId)));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  });
}

export async function clearLegacyReferences() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key === legacyKey || key.startsWith(legacyKey + '.pending.'));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

export async function recoverCitizenSubmissions(access: CitizenAccess, citizenId: number, signal: AbortSignal) {
  const prefix = citizenPrefix(citizenId);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  let recovered = false;
  for (const storageKey of keys) {
    if (signal.aborted || access.signal?.aborted) break;
    try {
      await recoverCitizenReceipt(access, storageKey.slice(prefix.length), signal);
      recovered = true;
      await AsyncStorage.removeItem(storageKey);
    } catch { /* Leave ambiguous attempts available for a later connection. */ }
  }
  return recovered;
}
