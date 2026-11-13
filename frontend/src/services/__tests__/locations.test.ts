import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocationFromCoords, getLocationSuggestions } from "../api";

describe("location API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([null, { id: "atlanta", label: "Atlanta, GA", city: "Atlanta", state: "GA", country: "US", lat: 33.749, lng: -84.388 }])("reads a single coordinate result: %j", async (data) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getLocationFromCoords(33.749, -84.388)).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith("/api/locations/coords?lat=33.749&lng=-84.388");
  });

  it("surfaces coordinate API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Location lookup failed" } }, { status: 502 })));
    await expect(getLocationFromCoords(0, 0)).rejects.toThrow("Location lookup failed");
  });

  it("loads encoded location suggestions through the shared API boundary", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "atlanta", label: "Atlanta, GA" }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getLocationSuggestions("Atlanta & Decatur", controller.signal)).resolves.toEqual([
      { id: "atlanta", label: "Atlanta, GA" }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/locations/autocomplete?q=Atlanta+%26+Decatur", {
      signal: controller.signal
    });
  });
});
