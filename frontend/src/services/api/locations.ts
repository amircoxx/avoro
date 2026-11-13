/** Browser API operation for cancellable city-autocomplete lookups. */
import { apiUrl, readApiResponse } from "./client";
import type { LocationSuggestion } from "./types";

export async function getLocationSuggestions(query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(apiUrl(`/api/locations/autocomplete?${params.toString()}`), { signal });
  return readApiResponse<LocationSuggestion[]>(response, "Location lookup failed");
}

export async function getLocationFromCoords(lat: number, lng: number) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const response = await fetch(apiUrl(`/api/locations/coords?${params.toString()}`));
  return readApiResponse<LocationSuggestion | null>(response, "Location lookup failed");
}
