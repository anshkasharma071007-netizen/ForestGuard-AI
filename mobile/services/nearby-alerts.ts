import type { Coordinates, PublicAdvisories, SavedLocation } from './api';

export type AlertSort = 'time' | 'risk' | 'distance';

const risk = { high: 3, moderate: 2, low: 1 };
const nearbyKm = 25;

function distanceKm(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180;
  const sinLat = Math.sin((to.lat - from.lat) * radians / 2);
  const sinLon = Math.sin((to.lon - from.lon) * radians / 2);
  const fraction = sinLat ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * sinLon ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, fraction))));
}

export function nearbyAlerts(feed: PublicAdvisories, location: SavedLocation, sort: AlertSort): PublicAdvisories {
  const items = feed.items.map((item) => ({
    ...item, distanceKm: item.approximateLocations.length
      ? Math.min(...item.approximateLocations.map((point) => distanceKm(location, point))) : undefined,
  })).filter((item) => (
    (location.type === 'village' && item.villageNames.includes(location.village.name))
    || (item.distanceKm !== undefined && item.distanceKm <= nearbyKm)
  ));
  items.sort((a, b) => {
    const primary = sort === 'risk' ? (risk[b.severity as keyof typeof risk] ?? 0) - (risk[a.severity as keyof typeof risk] ?? 0)
      : sort === 'distance' ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : 0;
    return primary || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.id - a.id;
  });
  return { ...feed, items };
}
