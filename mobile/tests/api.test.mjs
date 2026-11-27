import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

process.env.EXPO_PUBLIC_API_URL = 'https://forest-guard.example';
globalThis.__DEV__ = true;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-constants') {
      return nextResolve('data:text/javascript,export default {}', context);
    }
    if (specifier === 'react-native') {
      return nextResolve('data:text/javascript,export const Platform = { OS: "android" }', context);
    }
    return nextResolve(specifier === './nearby-alerts' ? './nearby-alerts.ts' : specifier, context);
  },
});
const { getCitizenReports, getCitizenEvidence, getNearbyAlerts } = await import('../services/api.ts');
const { Platform } = await import('react-native');
hooks.deregister();

function session() {
  const controller = new AbortController();
  const expire = () => assert.fail('Unexpected session expiration');
  return { controller, access: { token: 'test-token', citizenId: 42, signal: controller.signal, expire } };
}

test('an active report request keeps its authentication and parses owned reports', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.match(url, /\/api\/citizen\/reports$/);
    assert.equal(request.headers.Authorization, 'Bearer test-token');
    assert.equal(request.headers['X-Citizen-Account'], '42');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.cache, 'no-store');
    return Response.json({ items: [{ reference_code: 'FG-TEST', lifecycle_status: 'pending',
      title: 'Citizen report', created_at: '2026-11-01T00:00:00Z' }] });
  });
  const reports = await getCitizenReports(session().access);
  assert.equal(reports[0].reference_code, 'FG-TEST');
});

test('a screen abort is intentional, including when Expo wraps the native cancellation', async (t) => {
  const screen = new AbortController();
  const log = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('fetch failed: Fetch request has been canceled')));
  }));
  const pending = getCitizenReports(session().access, screen.signal);
  screen.abort();
  await assert.rejects(pending, { kind: 'cancelled' });
  await assert.rejects(getCitizenReports(session().access, screen.signal), { kind: 'cancelled' });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(log.mock.callCount(), 0);
});

test('late success and unauthorized responses from a signed-out session are discarded', async (t) => {
  for (const status of [200, 401]) {
    const { access, controller } = session();
    let finishBody;
    const reading = Promise.withResolvers();
    t.mock.method(globalThis, 'fetch', async () => ({
      ok: status === 200, status, text: () => new Promise(resolve => {
        finishBody = resolve;
        reading.resolve();
      }),
    }));
    const pending = getCitizenReports(access);
    await reading.promise;
    controller.abort();
    finishBody(status === 200 ? '{"items":[]}' : '{}');
    await assert.rejects(pending, { kind: 'cancelled' });
  }
});

test('genuine transport failures and deadlines remain reportable', async (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch failed: Fetch request has been canceled');
  });
  await assert.rejects(getCitizenReports(session().access), { kind: 'unreachable' });
  assert.equal(log.mock.callCount(), 1);

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const response = Promise.withResolvers();
  let signal;
  fetch.mock.mockImplementation((_, init) => {
    signal = init.signal;
    return response.promise;
  });
  const pending = getCitizenReports(session().access);
  t.mock.timers.tick(30000);
  assert.equal(signal.aborted, true);
  response.resolve(Response.json({ items: [] }));
  await assert.rejects(pending, { kind: 'timeout' });
});

test('photographs use native bytes or browser blobs and still expire invalid sessions', async (t) => {
  const { access } = session();
  const signal = new AbortController().signal;
  const bytes = new Uint8Array([255, 216, 255]);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(url, /\/api\/citizen\/reports\/FG-TEST\/evidence$/);
    assert.equal(init.headers['X-Citizen-Account'], '42');
    if (Platform.OS === 'android') {
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      assert.equal(init.credentials, 'omit');
      return { ok: true, arrayBuffer: async () => bytes.buffer, blob: () => assert.fail('Native Blob called') };
    }
    assert.equal(init.credentials, 'include');
    assert.equal(init.headers.Authorization, undefined);
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } });
  });
  assert.deepEqual((await getCitizenEvidence(access, 'FG-TEST', signal)).bytes, bytes);
  Platform.OS = 'web';
  try {
    const { blob } = await getCitizenEvidence({ ...access, token: undefined }, 'FG-TEST', signal);
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(blob.size, bytes.length);
  } finally {
    Platform.OS = 'android';
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Session expired.' }, { status: 401 }));
  const expire = t.mock.fn();
  await assert.rejects(getCitizenEvidence({ ...access, expire }, 'FG-TEST', signal), { kind: 'unauthorized' });
  assert.equal(expire.mock.callCount(), 1);
});

test('nearby searches send the explicit radius without saving a preference first', async (t) => {
  for (const radius of [5, 10, 20, 25]) {
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.match(url, /\/api\/citizen\/nearby-alerts$/);
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), { source: 'saved', radius_km: radius, sort: 'distance', offset: 0 });
      return Response.json({ items: [], next_offset: null });
    });
    assert.deepEqual(await getNearbyAlerts(session().access, { source: 'saved' }, radius, 'distance', 0),
      { items: [], nextOffset: null });
  }
});
