import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertRadii, isAlertRadius, nearbyAlertQuery } from '../services/nearby-alerts.ts';

test('saved-location discovery leaves coordinate lookup to the server', () => {
  assert.deepEqual(nearbyAlertQuery({ source: 'saved' }, 5, 'time', 0),
    { source: 'saved', radius_km: 5, sort: 'time', offset: 0 });
});

test('GPS discovery includes the current position and requested page', () => {
  assert.deepEqual(nearbyAlertQuery({ source: 'gps', lat: 21.83, lon: 79.31 }, 20, 'distance', 20),
    { source: 'gps', lat: 21.83, lon: 79.31, radius_km: 20, sort: 'distance', offset: 20 });
});

test('profile parsing accepts the supported radii', () => {
  assert.deepEqual(alertRadii.filter(isAlertRadius), [5, 10, 20, 25]);
  assert.equal(isAlertRadius(15), false);
  assert.equal(isAlertRadius('5'), false);
});
