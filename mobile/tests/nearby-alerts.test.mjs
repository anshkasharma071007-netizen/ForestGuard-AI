import assert from 'node:assert/strict';
import test from 'node:test';
import { nearbyAlerts } from '../services/nearby-alerts.ts';

const location = { type: 'gps', lat: 0, lon: 0 };
const village = { ...location, type: 'village', village: { id: 14, code: 'V', name: 'Test village' } };
const feed = {
  windowDays: 21,
  items: [
    { id: 1, severity: 'high', publishedAt: '2026-11-24T12:00:00Z', villageNames: [], villageIds: [], approximateLocations: [{ lat: 0, lon: 0.10 }] },
    { id: 2, severity: 'low', publishedAt: '2026-11-26T12:00:00Z', villageNames: [], villageIds: [], approximateLocations: [{ lat: 0.15, lon: 0 }] },
    { id: 3, severity: 'moderate', publishedAt: '2026-11-25T12:00:00Z', villageNames: [], villageIds: [], approximateLocations: [{ lat: 0, lon: 0.01 }] },
    { id: 4, severity: 'high', publishedAt: '2026-11-26T16:00:00Z', villageNames: [], villageIds: [], approximateLocations: [{ lat: 1, lon: 1 }] },
    { id: 5, severity: 'low', publishedAt: '2026-11-26T18:00:00Z', villageNames: ['Renamed village'], villageIds: [14], approximateLocations: [] },
  ],
};

test('GPS alerts use nearby village estimates and sort by time, severity or distance', () => {
  const ids = (sort) => nearbyAlerts(feed, location, sort).items.map(({ id }) => id);
  assert.deepEqual(ids('time'), [2, 3, 1]);
  assert.deepEqual(ids('risk'), [1, 3, 2]);
  assert.deepEqual(ids('distance'), [3, 1, 2]);
  const [nearest] = nearbyAlerts(feed, location, 'distance').items;
  assert.ok(nearest.distanceKm > 1 && nearest.distanceKm < 1.2);
});

test('village requests retain alerts without comparable coordinates after known distances', () => {
  const items = nearbyAlerts({ ...feed, items: feed.items.filter(({ id }) => id === 3 || id === 5) }, village, 'distance').items;
  assert.deepEqual(items.map(({ id }) => id), [3, 5]);
  assert.equal(items[1].distanceKm, undefined);
  assert.deepEqual(nearbyAlerts(feed, village, 'distance').items.map(({ id }) => id), [3, 1, 2, 5]);
});
