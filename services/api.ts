const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30000;

export const isApiConfigured = API_URL.length > 0;

export type ReportStatus = 'pending' | 'forwarded' | 'closed';
type ReportIdentity = { reference_code: string; status: ReportStatus };
export type ReportSubmissionResponse = ReportIdentity & { message: string };
export type ReportStatusResponse = ReportIdentity & { created_at?: string };
export type Village = { code: string; name: string };

export async function submitCommunityReport(formData: FormData): Promise<ReportSubmissionResponse> {
  if (!isApiConfigured) throw new Error('Reporting is unavailable. Your report was not sent.');

  const response = await fetchWithTimeout(`${API_URL}/api/community/reports`, { method: 'POST', body: formData });
  if (!response.ok) throw new Error('The report could not be submitted. Please try again.');

  const record = await readRecord(response);
  if (typeof record.message !== 'string') throw invalidResponse();
  return { ...parseIdentity(record), message: record.message };
}

export async function getReportStatus(referenceCode: string): Promise<ReportStatusResponse> {
  if (!isApiConfigured) throw new Error('Report status lookup is unavailable.');

  const response = await fetchWithTimeout(`${API_URL}/api/community/reports/${encodeURIComponent(referenceCode)}`);
  if (response.status === 404) throw new Error('That report could not be found.');
  if (!response.ok) throw new Error('The report status could not be loaded. Please try again.');

  const record = await readRecord(response);
  return { ...parseIdentity(record), created_at: typeof record.created_at === 'string' ? record.created_at : undefined };
}

export async function getCommunityVillages(): Promise<Village[]> {
  if (!isApiConfigured) throw new Error('The village list is unavailable.');
  const response = await fetchWithTimeout(`${API_URL}/api/community/summary`);
  if (!response.ok) throw new Error('The village list could not be loaded.');
  const { villages } = await readRecord(response);
  if (!Array.isArray(villages)) throw invalidResponse();
  return villages.map((value: unknown) => {
    if (!value || typeof value !== 'object' || !('code' in value) || !('name' in value)
      || typeof value.code !== 'string' || typeof value.name !== 'string' || !value.code || !value.name) {
      throw invalidResponse();
    }
    return { code: value.code, name: value.name };
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request timed out. Check your connection and try again.');
    }
    throw new Error('The Forest Guard service could not be reached. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

async function readRecord(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}

function parseIdentity(record: Record<string, unknown>): ReportIdentity {
  const { reference_code, status } = record;
  if (typeof reference_code !== 'string' || !reference_code.trim()
    || (status !== 'pending' && status !== 'forwarded' && status !== 'closed')) {
    throw invalidResponse();
  }
  return { reference_code, status };
}

function invalidResponse() {
  return new Error('The Forest Guard service returned an invalid response.');
}

export async function getCommunitySpecies(): Promise<{ id: string; label: string }[]> {
  if (!isApiConfigured) return [];
  const response = await fetchWithTimeout(`${API_URL}/api/community/guidelines`);
  if (!response.ok) throw new Error('The species catalog could not be loaded.');
  const { species } = await readRecord(response);
  if (!Array.isArray(species)) throw invalidResponse();
  const catalog = new Map<string, string>();
  for (const item of species) {
    if (!item || typeof item.key !== 'string' || !item.key.trim() || typeof item.name !== 'string' || !item.name.trim()) {
      throw invalidResponse();
    }
    if (item.key !== 'unidentified') catalog.set(item.key, item.name);
  }
  return Array.from(catalog, ([id, label]) => ({ id, label }));
}
