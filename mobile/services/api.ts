const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30000;

export const isApiConfigured = /^https?:\/\/[^/\s]+(?::\d+)?(?:\/[^\s]*)?$/i.test(API_URL);

export type ApiErrorKind = 'unavailable' | 'unreachable' | 'timeout' | 'invalid-input' | 'not-found' | 'request-failed' | 'invalid-response';

export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ReportStatus = 'pending' | 'forwarded' | 'closed';
type ReportIdentity = { reference_code: string; status: ReportStatus };
export type ReportSubmissionResponse = ReportIdentity & { message: string };
export type ReportStatusResponse = ReportIdentity & {
  created_at?: string;
  species_name?: string;
  village_name?: string;
  status_note?: string;
};
export type Village = { code: string; name: string; district?: string };
export type Advisory = {
  id: number;
  severity: string;
  speciesName: string;
  area: string;
  villageNames: string[];
  summary?: string;
  advice?: string;
  publishedAt: string;
};
export type PublicAdvisories = { items: Advisory[]; windowDays: number };
export type CommunityGuidance = {
  species: { id: string; label: string }[];
  general: string[];
  sourceNote?: string;
};

export type BackendHealth = { status: 'ok' | 'degraded'; demoMode: boolean };

export async function getBackendHealth(signal?: AbortSignal): Promise<BackendHealth> {
  const { status, demo_mode } = await request('/api/health', { signal });
  if ((status !== 'ok' && status !== 'degraded') || typeof demo_mode !== 'boolean') throw invalidResponse();
  return { status, demoMode: demo_mode };
}

export async function getCommunityVillages(signal?: AbortSignal): Promise<Village[]> {
  const { items } = await request('/api/community/villages', { signal });
  return list(items).map((item) => ({
    code: requiredText(item.code),
    name: requiredText(item.name),
    district: optionalText(item.district),
  }));
}

export async function getPublicAlerts(signal?: AbortSignal): Promise<PublicAdvisories> {
  const { items, window_days } = await request('/api/community/alerts?limit=50', { signal });
  if (typeof window_days !== 'number' || !Number.isInteger(window_days) || window_days < 1) throw invalidResponse();
  const results = list(items);
  if (results.some((item) => typeof item.is_simulated !== 'boolean')) throw invalidResponse();
  return {
    windowDays: window_days,
    items: results.filter((item) => item.is_simulated === false).map((item) => {
      const { id, severity, species_name, area_label, village_names, summary, advice, created_at } = item;
      if (typeof id !== 'number' || !Number.isInteger(id)) throw invalidResponse();
      const publishedAt = optionalDate(created_at);
      if (!publishedAt) throw invalidResponse();
      return {
        id,
        severity: requiredText(severity),
        speciesName: requiredText(species_name),
        area: requiredText(area_label),
        villageNames: textList(village_names),
        summary: optionalText(summary),
        advice: optionalText(advice),
        publishedAt,
      };
    }),
  };
}

export async function getCommunityGuidance(signal?: AbortSignal): Promise<CommunityGuidance> {
  const { species, general, source_note } = await request('/api/community/guidelines', { signal });
  const catalog = new Map<string, string>();
  for (const item of list(species)) {
    const id = requiredText(item.key);
    if (id !== 'unidentified') catalog.set(id, requiredText(item.name));
  }
  return {
    species: Array.from(catalog, ([id, label]) => ({ id, label })),
    general: textList(general),
    sourceNote: optionalText(source_note),
  };
}

export async function submitCommunityReport(formData: FormData): Promise<ReportSubmissionResponse> {
  const record = await request('/api/community/reports', { method: 'POST', body: formData }, { submission: true });
  if (typeof record.message !== 'string') throw invalidResponse();
  return { ...parseIdentity(record), message: record.message };
}

export async function getReportStatus(referenceCode: string, signal?: AbortSignal): Promise<ReportStatusResponse> {
  const code = referenceCode.trim().toUpperCase();
  if (!code) throw new ApiError('invalid-input', 'Enter a reference code.');
  const path = `/api/community/reports/${encodeURIComponent(code)}`;
  const record = await request(path, { signal }, { notFound: 'That report could not be found.' });
  return {
    ...parseIdentity(record),
    created_at: optionalDate(record.created_at),
    species_name: optionalText(record.species_name),
    village_name: optionalText(record.village_name),
    status_note: optionalText(record.status_note),
  };
}

async function request(path: string, init: RequestInit, context?: { submission?: boolean; notFound?: string }) {
  if (!isApiConfigured) throw new ApiError('unavailable', 'The Forest Guard service is not configured on this device.');

  const controller = new AbortController();
  const cancel = () => controller.abort();
  const signal = init.signal;
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = await response.text();
    let value: unknown;
    try { value = JSON.parse(payload); } catch { value = null; }

    if (response.ok) return object(value);
    if (response.status === 404 && context?.notFound) throw new ApiError('not-found', context.notFound);
    if (response.status === 404 || response.status === 501 || response.status === 405) {
      throw new ApiError('unavailable', 'This feature is unavailable on the configured service.');
    }
    if ([400, 413, 415, 422].includes(response.status)) {
      throw new ApiError('invalid-input', validationMessage(value) ?? 'Check the information you entered and try again.');
    }
    if (response.status === 429) throw new ApiError('request-failed', 'Too many requests. Try again shortly.');
    throw new ApiError('request-failed', 'The Forest Guard service could not complete the request. Try again.');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError('timeout', context?.submission
        ? 'The request timed out. The service may have received your report.'
        : 'The request timed out. Check your connection and try again.');
    }
    throw new ApiError('unreachable', 'Could not reach Forest Guard. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function validationMessage(value: unknown) {
  if (value === null || typeof value !== 'object' || !('detail' in value)) return;
  if (typeof value.detail === 'string') return value.detail;
  if (Array.isArray(value.detail)) {
    const messages = value.detail.flatMap((item: unknown) => {
      if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') return [item.msg];
      return [];
    });
    return messages.join(' ') || undefined;
  }
}

function parseIdentity(record: Record<string, unknown>): ReportIdentity {
  const { status } = record;
  if (status !== 'pending' && status !== 'forwarded' && status !== 'closed') throw invalidResponse();
  return { reference_code: requiredText(record.reference_code), status };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}

function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(object);
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(requiredText);
}

function requiredText(value: unknown): string {
  const text = optionalText(value);
  if (text === undefined) throw invalidResponse();
  return text;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function optionalDate(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function invalidResponse() {
  return new ApiError('invalid-response', 'The Forest Guard service returned an invalid response.');
}
