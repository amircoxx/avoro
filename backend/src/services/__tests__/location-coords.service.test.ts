import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../config/load-local-env", () => ({ loadLocalEnv: vi.fn() }));
import { searchCoords } from "../location-coords.service";

const result = { place_id: "atlanta", formatted: "Atlanta, GA", city: "Atlanta", state_code: "GA", country_code: "us", lat: 33.749, lon: -84.388 };

describe("coordinate provider service", () => {
  beforeEach(() => vi.stubEnv("GEOAPIFY_API_KEY", "test-key"));
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("sends longitude as lon and normalizes a city", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [result] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchCoords(33.749, -84.388)).toEqual({ id: "atlanta", label: "Atlanta, GA", city: "Atlanta", state: "GA", country: "US", lat: 33.749, lng: -84.388 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/geocode/reverse");
    expect(Object.fromEntries(url.searchParams)).toEqual({ lat: "33.749", lon: "-84.388", type: "city", format: "json", apiKey: "test-key" });
  });

  it.each([null, {}, { results: [] }, { results: [null] }, { results: [{ ...result, lat: "33" }] }, { results: [{ ...result, country_code: 7 }] }, { results: [{ ...result, city: null }] }])(
    "returns no location for unusable payload %j", async (payload) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
      expect(await searchCoords(33.749, -84.388)).toBeNull();
    }
  );

  it("rejects a missing key without fetching", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchCoords(0, 0)).rejects.toMatchObject({ status: 503, code: "location_lookup_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["http", "network", "json"])("normalizes %s provider failures", async (failure) => {
    vi.stubGlobal("fetch", failure === "network"
      ? vi.fn().mockRejectedValue(new Error("private provider details"))
      : vi.fn().mockResolvedValue(failure === "http" ? new Response("error", { status: 429 }) : new Response("invalid json")));
    await expect(searchCoords(0, 0)).rejects.toMatchObject({ status: 502, code: "location_lookup_failed", message: "Location lookup failed" });
  });
});
