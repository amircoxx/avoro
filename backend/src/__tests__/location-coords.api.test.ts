import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coords = vi.hoisted(() => ({ searchCoords: vi.fn() }));
vi.mock("../services/location-coords.service", () => coords);
import { app } from "../app";

describe("coordinate lookup API", () => {
  beforeEach(() => coords.searchCoords.mockReset());

  it.each([["33.749", "-84.388"], ["0", "0"], ["-90", "-180"], ["90", "180"]])(
    "accepts coordinates %s, %s", async (lat, lng) => {
      coords.searchCoords.mockResolvedValue(null);
      const response = await request(app).get(`/api/locations/coords?lat=${lat}&lng=${lng}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: null });
      expect(coords.searchCoords).toHaveBeenCalledWith(Number(lat), Number(lng));
    }
  );

  it.each(["", "lat=0", "lng=0", "lat=&lng=0", "lat=%20&lng=0", "lat=abc&lng=0", "lat=Infinity&lng=0", "lat=91&lng=0", "lat=-91&lng=0", "lat=0&lng=181", "lat=0&lng=-181", "lat=1&lat=2&lng=0"])(
    "rejects invalid query before provider lookup: %s", async (query) => {
      const response = await request(app).get(`/api/locations/coords?${query}`);
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ error: { code: "validation_error" } });
      expect(coords.searchCoords).not.toHaveBeenCalled();
    }
  );
});
