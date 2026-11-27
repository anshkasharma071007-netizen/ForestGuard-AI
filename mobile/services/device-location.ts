import * as Location from 'expo-location';

export class LocationPermissionError extends Error {}

export async function getCurrentCoordinates() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new LocationPermissionError('Location permission was denied.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Location services are disabled.');

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { coords } = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timed out.')), 12000); }),
    ]);
    return { lat: coords.latitude, lon: coords.longitude };
  } finally {
    clearTimeout(timer);
  }
}
