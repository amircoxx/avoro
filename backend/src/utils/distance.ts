/** Centralizes unit conversion used by location-aware marketplace queries. */
export const METERS_PER_MILE = 1609.344;

export function milesToMeters(miles: number) {
  return Math.round(miles * METERS_PER_MILE);
}

export function metersToMiles(meters: number) {
  return meters / METERS_PER_MILE;
}
