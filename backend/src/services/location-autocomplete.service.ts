/** Translates city search input into normalized Geoapify location suggestions. */
import { AppError, isRecord } from "../utils/errors";
import { loadLocalEnv } from "../config/load-local-env";

export type LocationSuggestion = {
  id: string;
  label: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number;
  lng: number;
};

export function buildGeoapifyAutocompleteUrl(text: string, apiKey: string) {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", text);
  url.searchParams.set("type", "city");
  url.searchParams.set("filter", "countrycode:us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", apiKey);
  return url;
}

export function normalizeGeoapifyAutocompleteResponse(payload: unknown): LocationSuggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.flatMap((result): LocationSuggestion[] => {
    if (!isRecord(result)) return [];

    const lat = getNumber(result.lat);
    const lng = getNumber(result.lon);
    const label = getString(result.formatted);
    if (lat === null || lng === null || !label) return [];

    return [
      {
        id: getString(result.place_id) || label,
        label,
        city: getString(result.city),
        state: getString(result.state_code) || getString(result.state),
        country: getString(result.country_code)?.toUpperCase() ?? null,
        lat,
        lng
      }
    ];
  });
}

export async function searchLocationSuggestions(query: string) {
  loadLocalEnv();
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new AppError("Geoapify API key is not configured", 503, "location_autocomplete_unavailable");
  }

  const response = await fetch(buildGeoapifyAutocompleteUrl(query, apiKey), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new AppError("Location autocomplete failed", 502, "location_autocomplete_failed");
  }

  return normalizeGeoapifyAutocompleteResponse(await response.json());
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
