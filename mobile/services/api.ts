import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isAlertRadius, nearbyAlertQuery, type AlertLocation, type AlertRadius, type AlertSort } from './nearby-alerts';

function defaultOrigin() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(window.location.origin);
    if (__DEV__) url.port = '8000';
    return url.origin;
  }
  if (!__DEV__) return '';
  const expoHost = Constants.expoConfig?.hostUri;
  const host = expoHost ? new URL(`http://${expoHost}`).hostname : 'localhost';
  const androidLoopback = Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1');
  return `http://${androidLoopback ? '10.0.2.2' : host}:8000`;
}
// Browser development uses the same host as Metro so its HttpOnly cookie stays same-site.
const configuredOrigin = Platform.OS === 'web' ? process.env.EXPO_PUBLIC_WEB_API_URL?.trim() : undefined;
const nativeOrigin = __DEV__ && Platform.OS === 'web' ? undefined : process.env.EXPO_PUBLIC_API_URL?.trim();
const API_URL = (configuredOrigin || nativeOrigin || defaultOrigin()).replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 30000;

export const isApiConfigured = /^https?:\/\/[^/\s]+(?::\d+)?(?:\/[^\s]*)?$/i.test(API_URL);

export type ApiErrorKind = 'cancelled' | 'unavailable' | 'unreachable' | 'timeout' | 'invalid-input' | 'not-found' | 'unauthorized' | 'request-failed' | 'invalid-response';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'ApiError';
  }
}

const statuses = ['pending', 'forwarded', 'verified', 'rejected', 'closed', 'under_work', 'resolved'] as const;
export type ReportStatus = typeof statuses[number];
export function isReportStatus(value: unknown): value is ReportStatus {
  return statuses.some((status) => status === value);
}
type ReportIdentity = { reference_code: string; status: ReportStatus };
export type ReportSubmissionResponse = ReportIdentity & { message: string };
export type Village = { id: number; code: string; name: string; district?: string; isDemo: boolean; center?: Coordinates };
export type Coordinates = { lat: number; lon: number };
export type Place = Coordinates & { label: string };
export type SavedLocation = ({ type: 'gps'; label?: string } | { type: 'village'; village: Village }) & Coordinates;
export type LocationInput = (Coordinates & { label?: string }) | { village_id: number };
export type PushPreferences = { reports: boolean; nearby: boolean };
export type CitizenProfile = { id: number; name: string; email: string | null; phone: string | null; emailVerified: boolean; location: SavedLocation | null;
  savedAlertLocation: SavedLocation | null; alertRadiusKm: AlertRadius; push: PushPreferences };
export type CitizenAccess = {
  token?: string;
  citizenId?: number;
  signal?: AbortSignal;
  expire: () => void;
};
export type CitizenReport = ReportIdentity & { title: string; createdAt: string; village?: string; locationLabel?: string };
export type CitizenNotification = {
  id: string; event: string; code: string; reportTitle?: string; createdAt: string; readAt?: string; risk?: string;
};
export type Advisory = {
  id: number;
  severity: string;
  status?: string;
  speciesName: string;
  title?: string;
  area: string;
  villageNames: string[];
  villageIds: number[];
  summary?: string;
  advice?: string;
  publishedAt: string;
  approximateLocations: Coordinates[];
  distanceKm?: number;
  uncertaintyRadiusM?: number;
  isSimulated: boolean;
};
export type PublicAdvisories = { items: Advisory[]; nextOffset: number | null };
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
  return list(items).map(parseVillage);
}

export async function getNearbyAlerts(access: CitizenAccess, location: AlertLocation, radius: AlertRadius,
  sort: AlertSort, offset: number, signal?: AbortSignal): Promise<PublicAdvisories> {
  const { items, next_offset } = await citizenRequest(access, '/nearby-alerts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nearbyAlertQuery(location, radius, sort, offset)), signal,
  }, { unavailable: 'Nearby alerts require a Forest Guard backend that supports location searches.' });
  if (next_offset !== null && (typeof next_offset !== 'number' || !Number.isInteger(next_offset) || next_offset <= offset)) {
    throw invalidResponse();
  }
  const results = list(items);
  if (results.some((item) => typeof item.is_simulated !== 'boolean')) throw invalidResponse();
  return {
    nextOffset: next_offset,
    items: results.map((item) => {
      const { id, severity, species_name, area_label, village_names, summary, advice, created_at } = item;
      if (typeof id !== 'number' || !Number.isInteger(id)) throw invalidResponse();
      const publishedAt = optionalDate(created_at);
      if (!publishedAt) throw invalidResponse();
      return {
        id,
        severity: requiredText(severity),
        status: optionalText(item.status),
        speciesName: requiredText(species_name),
        title: optionalText(item.alert_title),
        area: requiredText(area_label),
        villageNames: textList(village_names),
        villageIds: Array.isArray(item.village_ids) ? item.village_ids.filter(Number.isInteger) : [],
        summary: optionalText(summary),
        advice: optionalText(advice),
        publishedAt,
        isSimulated: item.is_simulated === true,
        distanceKm: typeof item.distance_km === 'number' ? item.distance_km : undefined,
        uncertaintyRadiusM: typeof item.uncertainty_radius_m === 'number' ? item.uncertainty_radius_m : undefined,
        approximateLocations: Array.isArray(item.approximate_locations)
          ? list(item.approximate_locations).flatMap((location) => coordinates(location) ?? []) : [],
      };
    }),
  };
}

export async function getAllNearbyAlerts(access: CitizenAccess, location: AlertLocation, radius: AlertRadius,
  sort: AlertSort, signal: AbortSignal): Promise<Advisory[]> {
  const alerts = new Map<number, Advisory>();
  let offset = 0;
  while (!signal.aborted) {
    const page = await getNearbyAlerts(access, location, radius, sort, offset, signal);
    page.items.forEach(alert => alerts.set(alert.id, alert));
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  return [...alerts.values()];
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

export async function submitCitizenReport(access: CitizenAccess, formData: FormData): Promise<ReportSubmissionResponse> {
  const record = await citizenRequest(access, '/reports', { method: 'POST', body: formData }, { submission: true });
  if (typeof record.message !== 'string') throw invalidResponse();
  return { ...parseIdentity(record), message: record.message };
}

export async function recoverCitizenReceipt(access: CitizenAccess, key: string, signal?: AbortSignal) {
  const body = new FormData();
  body.append('submission_key', key);
  return parseIdentity(await citizenRequest(access, '/report-receipt', { method: 'POST', body, signal },
    { notFound: 'Submission has not been received.' }));
}

export async function verifyCitizen(input: { email: string; code: string }) {
  const web = Platform.OS === 'web';
  const record = await request('/api/citizen/email-otp/verify', {
    method: 'POST', credentials: web ? 'include' : 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, transport: web ? 'cookie' : 'bearer' }),
  });
  return { profile: parseProfile(object(record.profile)), token: web ? undefined : requiredText(record.token) };
}

export async function sendCitizenCode(email: string) {
  const { retry_after } = await request('/api/citizen/email-otp/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  if (typeof retry_after !== 'number') throw invalidResponse();
  return retry_after;
}

const jsonRequest = (method: string, data: unknown, signal?: AbortSignal): RequestInit =>
  ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal });

export async function searchCitizenPlaces(access: CitizenAccess, text: string, mode: 'autocomplete' | 'search',
  signal: AbortSignal): Promise<Place[]> {
  const { items } = await citizenRequest(access, '/locations/search', jsonRequest('POST', { text, mode }, signal));
  return list(items).map(item => {
    const point = coordinates(item);
    if (!point) throw invalidResponse();
    return { ...point, label: requiredText(item.label) };
  });
}

export async function reverseCitizenLocation(access: CitizenAccess, point: Coordinates, signal: AbortSignal) {
  const { label } = await citizenRequest(access, '/locations/reverse', jsonRequest('POST', point, signal));
  return optionalText(label);
}

export async function savePushPreferences(access: CitizenAccess, preferences: PushPreferences) {
  return parsePush(await citizenRequest(access, '/push/preferences', jsonRequest('PUT', preferences)));
}

export async function registerPushDevice(access: CitizenAccess, installation: string, token: string) {
  await citizenRequest(access, '/push/device', jsonRequest('PUT', { installation, token }));
}

export async function unregisterPushDevice(access: CitizenAccess, installation: string) {
  await citizenRequest(access, `/push/device/${installation}`, { method: 'DELETE' });
}

export async function openPushEvent(access: CitizenAccess, id: string) {
  const data = await citizenRequest(access, '/push/open', jsonRequest('POST', { id }));
  if (data.screen === 'report') return { screen: 'report' as const, code: requiredText(data.reference_code) };
  if (data.screen === 'map' && typeof data.alert_id === 'number') return { screen: 'map' as const, alertId: data.alert_id };
  throw invalidResponse();
}

export async function getCitizenProfile(access: CitizenAccess, signal?: AbortSignal) {
  return parseProfile(await citizenRequest(access, '/profile', { signal }));
}

export async function updateCitizenProfile(access: CitizenAccess, input: { name: string; phone?: string | null; location?: LocationInput }) {
  return parseProfile(await citizenRequest(access, '/profile', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
}

export async function updateSavedAlertLocation(access: CitizenAccess, location: LocationInput | null) {
  return parseProfile(await citizenRequest(access, '/saved-location', location ? {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(location),
  } : { method: 'DELETE' }));
}

export async function updateAlertRadius(access: CitizenAccess, radius: AlertRadius) {
  const result = await citizenRequest(access, '/alert-preferences', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radius_km: radius }),
  });
  if (!isAlertRadius(result.radius_km)) throw invalidResponse();
  return result.radius_km;
}

export async function endCitizenSession(access: CitizenAccess) {
  const result = await citizenRequest(access, '/sign-out', { method: 'POST' });
  if (result.signed_out !== true) throw invalidResponse();
}

export async function getCitizenReports(access: CitizenAccess, signal?: AbortSignal) {
  const { items } = await citizenRequest(access, '/reports', { signal });
  return list(items).map(parseCitizenReport);
}

export async function getCitizenReport(access: CitizenAccess, code: string, signal?: AbortSignal) {
  const record = await citizenRequest(access, `/reports/${encodeURIComponent(code)}`, { signal }, { notFound: 'Report unavailable.' });
  return { ...parseCitizenReport(record), category: requiredText(record.category), description: optionalText(record.description),
    species: requiredText(record.species_name), coordinates: coordinates(record),
    rejectionReason: optionalText(record.rejection_reason), confirmedSpecies: optionalText(record.confirmed_species_name),
    locationSource: optionalText(record.location_source), risk: optionalText(record.risk_level),
    reviewNote: optionalText(record.review_note), resolutionNote: optionalText(record.resolution_note),
    events: list(record.events ?? []).flatMap((item) => {
      const at = optionalDate(item.at);
      return at && typeof item.event === 'string' ? [{ event: item.event, at }] : [];
    }),
    hasPhoto: record.has_photo === true, analysis: requiredText(record.analysis_status), suggestions: textList(record.suggested_species) };
}

export async function getCitizenNotifications(access: CitizenAccess, signal?: AbortSignal) {
  const { items, unread } = await citizenRequest(access, '/notifications', { signal });
  if (typeof unread !== 'number' || !Number.isInteger(unread) || unread < 0) throw invalidResponse();
  return { unread, items: list(items).map((item): CitizenNotification => {
    const createdAt = optionalDate(item.created_at);
    if (!createdAt) throw invalidResponse();
    return { id: requiredText(item.id), event: requiredText(item.event), code: requiredText(item.reference_code),
      reportTitle: optionalText(item.report_title), createdAt, readAt: optionalDate(item.read_at), risk: optionalText(item.risk_level) };
  }) };
}

export async function markCitizenNotificationsRead(access: CitizenAccess, id?: string) {
  const path = id ? `/notifications/${encodeURIComponent(id)}/read` : '/notifications/read-all';
  return citizenRequest(access, path, { method: 'POST' });
}

function citizenHeaders(access: CitizenAccess) {
  return {
    ...(access.token ? { Authorization: `Bearer ${access.token}` } : {}),
    ...(access.citizenId ? { 'X-Citizen-Account': String(access.citizenId) } : {}),
  };
}

export async function getCitizenEvidence(access: CitizenAccess, code: string, signal: AbortSignal) {
  return citizenResponse(access, `/reports/${encodeURIComponent(code)}/evidence`, { signal }, async (response) => {
    if (Platform.OS === 'web') return { blob: await response.blob() };
    return { bytes: new Uint8Array(await response.arrayBuffer()) };
  }, { notFound: 'Photo unavailable.' });
}

type RequestContext = { submission?: boolean; notFound?: string; unavailable?: string };

function citizenRequest(access: CitizenAccess, path: string, init: RequestInit, context?: RequestContext) {
  return citizenResponse(access, path, { ...init, headers: { Accept: 'application/json', ...init.headers } }, readObject, context);
}

async function citizenResponse<T>(access: CitizenAccess, path: string, init: RequestInit,
  read: (response: Response) => Promise<T>, context?: RequestContext) {
  try {
    return await fetchResponse(`/api/citizen${path}`, {
      ...init, credentials: Platform.OS === 'web' ? 'include' : 'omit', cache: 'no-store',
      headers: { ...init.headers, ...citizenHeaders(access) },
    }, read, context, access.signal);
  } catch (error) {
    if (!access.signal?.aborted && !init.signal?.aborted && error instanceof ApiError && error.kind === 'unauthorized') {
      access.expire();
    }
    throw error;
  }
}

function request(path: string, init: RequestInit) {
  return fetchResponse(path, { ...init, headers: { Accept: 'application/json', ...init.headers } }, readObject);
}

async function readJson(response: Response): Promise<unknown> {
  const payload = await response.text();
  try { return JSON.parse(payload); } catch { return null; }
}

async function readObject(response: Response) {
  return object(await readJson(response));
}

async function fetchResponse<T>(path: string, init: RequestInit, read: (response: Response) => Promise<T>,
  context?: RequestContext, sessionSignal?: AbortSignal) {
  const signal = init.signal;
  const cancelled = () => signal?.aborted || sessionSignal?.aborted;
  const cancellation = () => new ApiError('cancelled', 'The request was cancelled.');
  if (cancelled()) throw cancellation();
  if (!isApiConfigured) throw new ApiError('unavailable', 'The Forest Guard service is not configured on this device.');

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  sessionSignal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
    if (controller.signal.aborted) throw cancellation();
    if (response.ok) {
      const data = await read(response);
      if (controller.signal.aborted) throw cancellation();
      return data;
    }

    const value = await readJson(response);
    if (response.status === 401) throw new ApiError('unauthorized', validationMessage(value) ?? 'Sign in again.');
    if (response.status === 404 && context?.notFound) throw new ApiError('not-found', context.notFound);
    if (response.status === 404 || response.status === 501 || response.status === 405) {
      throw new ApiError('unavailable', context?.unavailable ?? 'This feature is unavailable on the configured service.');
    }
    if ([400, 403, 409, 413, 415, 422].includes(response.status)) {
      throw new ApiError('invalid-input', validationMessage(value) ?? 'Check the information you entered and try again.');
    }
    if ([410, 429, 502, 503].includes(response.status)) throw new ApiError('request-failed',
      validationMessage(value) ?? 'The Forest Guard service is temporarily unavailable. Try again shortly.');
    throw new ApiError('request-failed', 'The Forest Guard service could not complete the request. Try again.');
  } catch (error) {
    if (cancelled()) throw cancellation();
    if (timedOut) {
      throw new ApiError('timeout', context?.submission
        ? 'The request timed out. Retry this report to retrieve its reference.'
        : 'The request timed out. Check your connection and try again.');
    }
    if (error instanceof ApiError) throw error;
    if (__DEV__) console.error('[API Error]', path, error);
    throw new ApiError('unreachable', 'Could not reach Forest Guard. Check your Wi-Fi and API address, then retry.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
    sessionSignal?.removeEventListener('abort', cancel);
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
  const status = record.lifecycle_status ?? record.status;
  if (!isReportStatus(status)) throw invalidResponse();
  return { reference_code: requiredText(record.reference_code), status };
}

function coordinates({ lat, lon }: Record<string, unknown>): Coordinates | undefined {
  if (typeof lat === 'number' && typeof lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
}

function parseVillage(record: Record<string, unknown>): Village {
  if (typeof record.id !== 'number' || !Number.isInteger(record.id) || record.id < 1) throw invalidResponse();
  return {
    id: record.id, code: requiredText(record.code), name: requiredText(record.name),
    district: optionalText(record.district), isDemo: record.is_demo === true, center: coordinates(record),
  };
}

function parseLocation(location: unknown): SavedLocation | null {
  if (location === null) return null;
  const data = object(location);
  const point = coordinates(data);
  if (!point) throw invalidResponse();
  if (data.type === 'gps') return { type: 'gps', ...point, label: optionalText(data.label) };
  if (data.type === 'village') {
    const village = object(data.village);
    return { type: 'village', ...point, village: { ...parseVillage(village), center: point } };
  }
  throw invalidResponse();
}

function parseProfile(record: Record<string, unknown>): CitizenProfile {
  const { id, name, email, phone, location, saved_alert_location, alert_radius_km } = record;
  if (typeof id !== 'number' || !Number.isInteger(id)) throw invalidResponse();
  const saved = parseLocation(location);
  return { id, name: typeof name === 'string' ? name : '', phone: optionalText(phone) ?? null, emailVerified: record.email_verified === true, email: optionalText(email) ?? null, location: saved,
    savedAlertLocation: saved_alert_location === undefined ? saved : parseLocation(saved_alert_location),
    alertRadiusKm: isAlertRadius(alert_radius_km) ? alert_radius_km : 25,
    push: parsePush({ reports: record.push_reports, nearby: record.push_nearby }) };
}

function parsePush(record: Record<string, unknown>): PushPreferences {
  return { reports: record.reports === true, nearby: record.nearby === true };
}

function parseCitizenReport(record: Record<string, unknown>): CitizenReport {
  const createdAt = optionalDate(record.created_at);
  if (!createdAt) throw invalidResponse();
  return { ...parseIdentity(record), title: requiredText(record.title), createdAt, village: optionalText(record.village_name),
    locationLabel: optionalText(record.location_label) };
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
