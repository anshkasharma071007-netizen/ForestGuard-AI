import type { Coordinates } from './api';

export type AlertSort = 'time' | 'risk' | 'distance';
export type AlertRadius = 5 | 10 | 20 | 25;
export type AlertLocation = { source: 'saved' } | ({ source: 'gps' } & Coordinates);

export const alertRadii = [5, 10, 20, 25] as const;

export function isAlertRadius(value: unknown): value is AlertRadius {
  return alertRadii.some((radius) => radius === value);
}

export function nearbyAlertQuery(location: AlertLocation, radius: AlertRadius, sort: AlertSort, offset: number) {
  return { ...location, radius_km: radius, sort, offset };
}
