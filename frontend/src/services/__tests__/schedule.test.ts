import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createScheduleService,
  deleteAvailabilityOverride,
  getSchedule,
  getScheduleBookings,
  getScheduleServices,
  replaceWeeklyAvailability,
  saveAvailabilityOverride,
  saveScheduleSettings,
  updateScheduleService
} from "../api";

const service = {
  id: "service-1",
  name: "Gel-X Full Set",
  description: "Prep and shaping",
  durationMinutes: 90,
  startingPriceCents: 8500,
  isActive: true
};

describe("schedule API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads settings, services, and range-bounded calendar bookings with credentials", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { settings: null, weeklyAvailability: [], overrides: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [service] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSchedule()).resolves.toEqual({ settings: null, weeklyAvailability: [], overrides: [] });
    await expect(getScheduleServices()).resolves.toEqual([service]);
    await expect(getScheduleBookings({ from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" })).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/schedule/settings", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/schedule/services", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/schedule/bookings?from=2026-08-01T00%3A00%3A00.000Z&to=2026-09-01T00%3A00%3A00.000Z", { credentials: "include" });
  });

  it("writes schedule settings and replaces recurring weekly availability", async () => {
    const settings = { timeZone: "America/New_York", minimumNoticeMinutes: 60, maximumAdvanceDays: 45, bufferMinutes: 15, cancellationCutoffMinutes: 120 };
    const weekly = [{ weekday: 1, windows: [{ startMinute: 540, endMinute: 1020 }] }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { settings, warnings: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { weeklyAvailability: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], warnings: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveScheduleSettings(settings)).resolves.toEqual({ settings, warnings: [] });
    await expect(replaceWeeklyAvailability(weekly)).resolves.toEqual({ weeklyAvailability: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], warnings: [] });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/schedule/settings", {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/schedule/weekly-availability", {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(weekly)
    });
  });

  it("creates, updates, and deactivates services using exact schedule resource paths", async () => {
    const input = { name: "Gel-X Full Set", description: "Prep and shaping", durationMinutes: 90, startingPriceCents: 8500, isActive: true };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: service }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...service, isActive: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createScheduleService(input)).resolves.toEqual(service);
    await expect(updateScheduleService("service / 1", { ...input, isActive: false })).resolves.toEqual({ ...service, isActive: false });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/schedule/services", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/schedule/services/service%20%2F%201", {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, isActive: false })
    });
  });

  it("writes and deletes encoded date overrides with the exact response contracts", async () => {
    const override = { kind: "custom" as const, windows: [{ startMinute: 600, endMinute: 900 }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { localDate: "2026-08-04", ...override, warnings: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { localDate: "2026-08-04", warnings: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveAvailabilityOverride("2026-08-04", override)).resolves.toEqual({ localDate: "2026-08-04", ...override, warnings: [] });
    await expect(deleteAvailabilityOverride("2026-08-04")).resolves.toEqual({ localDate: "2026-08-04", warnings: [] });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/schedule/overrides/2026-08-04", {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(override)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/schedule/overrides/2026-08-04", { method: "DELETE", credentials: "include" });
  });
});
