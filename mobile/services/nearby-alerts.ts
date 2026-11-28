import type { Coordinates } from './api';

export type AlertSort = 'time' | 'risk' | 'distance';
export type AlertRadius = 5 | 10 | 20 | 25;
export type AlertLocation = { source: 'saved' } | ({ source: 'gps' | 'selected'; label?: string } & Coordinates);

export const alertRadii = [5, 10, 20, 25] as const;

export function isAlertRadius(value: unknown): value is AlertRadius {
  return alertRadii.some((radius) => radius === value);
}

export function nearbyAlertQuery(location: AlertLocation, radius: AlertRadius, sort: AlertSort, offset: number) {
  const { source } = location;
  const point = location.source === 'saved' ? {} : { lat: location.lat, lon: location.lon };
  return { source, ...point, radius_km: radius, sort, offset };
}
