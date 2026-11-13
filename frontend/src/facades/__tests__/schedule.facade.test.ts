import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSchedule: vi.fn(),
  getScheduleServices: vi.fn(),
  getScheduleBookings: vi.fn(),
  saveScheduleSettings: vi.fn(),
  replaceWeeklyAvailability: vi.fn(),
  saveAvailabilityOverride: vi.fn(),
  deleteAvailabilityOverride: vi.fn(),
  createScheduleService: vi.fn(),
  updateScheduleService: vi.fn(),
  cancelBooking: vi.fn()
}));

vi.mock("@/services/api", () => api);

import { defaultScheduleFacade } from "../schedule.facade";

describe("schedule facade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads schedule configuration before the timezone-bounded calendar request", async () => {
    const schedule = { settings: null, weeklyAvailability: [], overrides: [] };
    api.getSchedule.mockResolvedValue(schedule);
    api.getScheduleServices.mockResolvedValue([]);

    await expect(defaultScheduleFacade.loadScheduleWorkspace()).resolves.toEqual({ schedule, services: [] });
    expect(api.getSchedule).toHaveBeenCalledOnce();
    expect(api.getScheduleServices).toHaveBeenCalledOnce();
    expect(api.getScheduleBookings).not.toHaveBeenCalled();
  });

  it("forwards exact offset-aware calendar bounds and the shared cancellation id", async () => {
    const range = { from: "2026-11-01T00:00:00.000-04:00", to: "2026-12-01T00:00:00.000-05:00" };
    const canceled = { id: "booking / 1", status: "CANCELED" };
    api.getScheduleBookings.mockResolvedValue([]);
    api.cancelBooking.mockResolvedValue(canceled);

    await expect(defaultScheduleFacade.loadBookings(range)).resolves.toEqual([]);
    await expect(defaultScheduleFacade.cancelBooking("booking / 1")).resolves.toBe(canceled);
    expect(api.getScheduleBookings).toHaveBeenCalledWith(range);
    expect(api.cancelBooking).toHaveBeenCalledWith("booking / 1");
  });

  it("preserves successful-save warnings verbatim", async () => {
    const warning = {
      bookingId: "booking-1",
      startAt: "2026-07-24T14:00:00.000Z",
      message: "Existing booking falls outside the updated availability" as const
    };
    const result = { weeklyAvailability: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], warnings: [warning] };
    api.replaceWeeklyAvailability.mockResolvedValue(result);

    await expect(defaultScheduleFacade.saveWeeklyAvailability([
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 1020 }] }
    ])).resolves.toBe(result);
  });

  it("forwards stable service lifecycle writes without reshaping them", async () => {
    const input = { name: "Gel-X", description: "Structured set", durationMinutes: 90, startingPriceCents: 8550, isActive: true };
    const service = { id: "service-1", ...input };
    api.createScheduleService.mockResolvedValue(service);
    api.updateScheduleService.mockResolvedValue({ ...service, isActive: false });

    await expect(defaultScheduleFacade.createService(input)).resolves.toBe(service);
    await expect(defaultScheduleFacade.updateService("service-1", { ...input, isActive: false })).resolves.toMatchObject({ id: "service-1", isActive: false });
    expect(api.updateScheduleService).toHaveBeenCalledWith("service-1", { ...input, isActive: false });
  });
});
