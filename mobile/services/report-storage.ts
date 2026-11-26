import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from 'expo';
import { Platform } from 'react-native';
import { isReportStatus, recoverReceipt, type ReportStatus, type ReportStatusResponse } from './api';

const STORAGE_KEY = 'forest-guard-ai.report-references';

export type StoredReport = {
  referenceCode: string;
  status: ReportStatus;
  // Legacy records store the date the reference was first saved on this device.
  submittedAt: string;
  createdAt?: string;
  statusCheckedAt?: string;
};

export async function loadStoredReports(): Promise<StoredReport[]> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredReport);
  } catch {
    return [];
  }
}

let pendingWrite = Promise.resolve();

export function saveStoredReport(report: StoredReport): Promise<void> {
  return saveStoredReports([report]);
}

export function saveStoredReports(reports: readonly StoredReport[]): Promise<void> {
  const write = pendingWrite.then(async () => {
    const existing = await loadStoredReports();
    const updated = new Set(reports.map(({ referenceCode }) => referenceCode));
    const next = [...reports, ...existing.filter(({ referenceCode }) => !updated.has(referenceCode))];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  });
  pendingWrite = write.catch(() => undefined);
  return write;
}

export function checkedReport(response: ReportStatusResponse, previous?: StoredReport): StoredReport {
  const now = new Date().toISOString();
  return {
    referenceCode: response.reference_code,
    status: response.status,
    submittedAt: previous?.submittedAt ?? now,
    createdAt: response.created_at ?? previous?.createdAt,
    statusCheckedAt: now,
  };
}

function isStoredReport(value: unknown): value is StoredReport {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.referenceCode === 'string' && typeof record.submittedAt === 'string'
    && (record.createdAt === undefined || typeof record.createdAt === 'string')
    && (record.statusCheckedAt === undefined || typeof record.statusCheckedAt === 'string')
    && isReportStatus(record.status);
}

// Save only a salted draft fingerprint and retry key before putting bytes on the network.
const pendingPrefix = STORAGE_KEY + '.pending.';

function newKey() {
  if (Platform.OS !== 'web' || typeof crypto.randomUUID === 'function') return uuid.v4();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export async function submissionKey(draft: string) {
  for (const storageKey of (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(pendingPrefix))) {
    const key = storageKey.slice(pendingPrefix.length);
    if (await AsyncStorage.getItem(storageKey) === uuid.v5(draft, key)) return key;
  }
  const key = newKey();
  await AsyncStorage.setItem(pendingPrefix + key, uuid.v5(draft, key));
  return key;
}

export function finishSubmission(key: string) {
  return AsyncStorage.removeItem(pendingPrefix + key);
}

export async function recoverSubmissions() {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(pendingPrefix));
  for (const storageKey of keys) {
    const key = storageKey.slice(pendingPrefix.length);
    try {
      const receipt = await recoverReceipt(key);
      await saveStoredReport({ referenceCode: receipt.reference_code, status: receipt.status, submittedAt: new Date().toISOString() });
      await finishSubmission(key);
    } catch { /* Keep ambiguous attempts for the next connection. */ }
  }
}
