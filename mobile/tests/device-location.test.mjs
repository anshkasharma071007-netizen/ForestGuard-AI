import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-location') return nextResolve('data:text/javascript,' + encodeURIComponent(`
      export const Accuracy = { Balanced: 3 };
      export const getForegroundPermissionsAsync = () => globalThis.locationMock.getPermission();
      export const requestForegroundPermissionsAsync = () => globalThis.locationMock.requestPermission();
      export const hasServicesEnabledAsync = () => globalThis.locationMock.services;
      export const enableNetworkProviderAsync = () => globalThis.locationMock.enableServices();
      export const getCurrentPositionAsync = () => globalThis.locationMock.getPosition();
    `), context);
    if (specifier === 'react-native') return nextResolve('data:text/javascript,' + encodeURIComponent(`
      export const Platform = { OS: 'android' };
      export const Linking = { openSettings: () => globalThis.locationMock.openSettings() };
    `), context);
    return nextResolve(specifier, context);
  },
});
const { getCurrentCoordinates, LocationPermissionError, openLocationSettings } = await import('../services/device-location.ts');
hooks.deregister();
const granted = { granted: true, canAskAgain: true };

test('current location asks for permission before trying to read GPS', async () => {
  const steps = [];
  globalThis.locationMock = {
    services: true,
    getPermission: () => ({ granted: false, canAskAgain: true }),
    requestPermission: () => { steps.push('request'); return granted; },
    getPosition: () => { steps.push('read'); return { coords: { latitude: 28.5, longitude: 77.5 } }; },
  };
  assert.deepEqual(await getCurrentCoordinates(), { lat: 28.5, lon: 77.5 });
  assert.deepEqual(steps, ['request', 'read']);
});

test('permanent denial exposes Settings without requesting again', async () => {
  let opened = false;
  globalThis.locationMock = {
    getPermission: () => ({ granted: false, canAskAgain: false }),
    requestPermission: () => assert.fail('Must not request again'),
    openSettings: () => { opened = true; },
  };
  await assert.rejects(getCurrentCoordinates(), error => error instanceof LocationPermissionError && !error.canAskAgain);
  await openLocationSettings();
  assert.equal(opened, true);
});

test('Android prompts to enable services and falls back when the prompt is declined', async () => {
  globalThis.locationMock = {
    services: false,
    getPermission: () => granted,
    enableServices: () => { globalThis.locationMock.services = true; },
    getPosition: () => ({ coords: { latitude: 1, longitude: 2 } }),
  };
  assert.deepEqual(await getCurrentCoordinates(), { lat: 1, lon: 2 });
  globalThis.locationMock.services = false;
  globalThis.locationMock.enableServices = () => { throw new Error('Cancelled'); };
  await assert.rejects(getCurrentCoordinates(), /Turn on location services/);
});
