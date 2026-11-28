import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export class LocationPermissionError extends Error {
  readonly canAskAgain: boolean;

  constructor(canAskAgain: boolean) {
    super(canAskAgain ? 'Location permission was denied. Retry or choose a location manually.'
      : 'Allow location access in Settings or choose a location manually.');
    this.canAskAgain = canAskAgain;
  }
}

export function openLocationSettings() {
  return Linking.openSettings();
}

export async function getCurrentCoordinates() {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new LocationPermissionError(permission.canAskAgain);

  if (!(await Location.hasServicesEnabledAsync())) {
    if (Platform.OS === 'android') {
      try { await Location.enableNetworkProviderAsync(); }
      catch { throw new Error('Turn on location services and try again, or choose a location manually.'); }
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error('Turn on location services and try again, or choose a location manually.');
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { coords } = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Could not get your location. Try again or choose it manually.')), 12000);
      }),
    ]);
    return { lat: coords.latitude, lon: coords.longitude };
  } finally {
    clearTimeout(timer);
  }
}
