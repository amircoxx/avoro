/** Converts coordinates into a validated city for Discover search. */
import { z } from "zod";
import { loadLocalEnv } from "../config/load-local-env";
import { AppError, isRecord } from "../utils/errors";
import type { LocationSuggestion } from "./location-autocomplete.service";

const optionalText = z.string().trim().min(1).nullish();
const cityResultSchema = z.object({
  place_id: optionalText,
  formatted: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state_code: optionalText,
  state: optionalText,
  country_code: z.string().trim().regex(/^[a-z]{2}$/i),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180)
});

export async function searchCoords(lat: number, lng: number): Promise<LocationSuggestion | null> {
  loadLocalEnv();
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new AppError("Geoapify API key is not configured", 503, "location_lookup_unavailable");
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("type", "city");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", apiKey);

  let payload: unknown;
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error("Provider request failed");
    payload = await response.json();
  } catch {
    throw new AppError("Location lookup failed", 502, "location_lookup_failed");
  }

  if (!isRecord(payload) || !Array.isArray(payload.results)) return null;
  const parsed = cityResultSchema.safeParse(payload.results[0]);
  if (!parsed.success) return null;
  const result = parsed.data;
  return {
    id: result.place_id || result.formatted,
    label: result.formatted,
    city: result.city,
    state: result.state_code || result.state || null,
    country: result.country_code.toUpperCase(),
    lat: result.lat,
    lng: result.lon
  };
}
