import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'forest-guard-ai.report-references';

export type StoredReport = {
  referenceCode: string;
  status: 'pending' | 'forwarded' | 'closed';
  submittedAt: string;
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

export async function saveStoredReport(report: StoredReport): Promise<void> {
  const existing = await loadStoredReports();
  const next = [report, ...existing.filter((item) => item.referenceCode !== report.referenceCode)].slice(0, 50);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function isStoredReport(value: unknown): value is StoredReport {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.referenceCode === 'string' && typeof record.submittedAt === 'string' && (record.status === 'pending' || record.status === 'forwarded' || record.status === 'closed');
}
