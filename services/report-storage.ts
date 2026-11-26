import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReportStatus } from './api';

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
    return parsed.filter(isStoredReport).slice(0, 50);
  } catch {
    return [];
  }
}

let pendingWrite = Promise.resolve();

export function saveStoredReport(report: StoredReport): Promise<void> {
  const write = pendingWrite.then(async () => {
    const existing = await loadStoredReports();
    const next = [report, ...existing.filter((item) => item.referenceCode !== report.referenceCode)].slice(0, 50);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  });
  pendingWrite = write.catch(() => undefined);
  return write;
}

function isStoredReport(value: unknown): value is StoredReport {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.referenceCode === 'string' && typeof record.submittedAt === 'string'
    && (record.createdAt === undefined || typeof record.createdAt === 'string')
    && (record.statusCheckedAt === undefined || typeof record.statusCheckedAt === 'string')
    && (record.status === 'pending' || record.status === 'forwarded' || record.status === 'closed');
}
