import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  booking: { findUnique: vi.fn(), findMany: vi.fn() },
  techScheduleSettings: { findUnique: vi.fn() },
  weeklyAvailabilityWindow: { findMany: vi.fn() },
  availabilityOverride: { findMany: vi.fn() }
}));
const prisma = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../../models/database.model", () => ({ prisma }));
import { getRescheduleAvailability } from "../availability.service";
const now = new Date("2026-07-20T12:00:00Z");
const actor = { id: "customer-1", role: "CUSTOMER" as const };
const booking = {
  id: "booking-1", customerId: actor.id, techProfileId: "tech-1", techServiceId: "service-1",
  techProfile: { userId: "owner-1" }, status: "CONFIRMED", version: 3,
  startAt: new Date("2026-07-21T13:00:00Z"), durationMinutesSnapshot: 60,
  cancellationCutoffMinutesSnapshot: 120, startingPriceCentsSnapshot: 8500, serviceNameSnapshot: "Original service"
};

describe("rescheduling availability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    tx.booking.findUnique.mockResolvedValue(booking);
    tx.booking.findMany.mockResolvedValue([]);
    tx.techScheduleSettings.findUnique.mockResolvedValue({
      timeZone: "America/New_York", minimumNoticeMinutes: 0, maximumAdvanceDays: 3, bufferMinutes: 30
    });
    tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([{ weekday: 2, startMinute: 540, endMinute: 720 }]);
    tx.availabilityOverride.findMany.mockResolvedValue([]);
  });

  it("returns saved service details, version and slots including the old occupied range", async () => {
    const result = await getRescheduleAvailability(actor, booking.id, "2026-07", now);
    expect(result).toMatchObject({ bookingId: booking.id, version: 3, cancellationCutoffMinutes: 120,
      service: { id: "service-1", name: "Original service", durationMinutes: 60, startingPriceCents: 8500 } });
    expect(result.slots.map(slot => slot.startAt)).toEqual([
      "2026-07-21T13:00:00.000Z", "2026-07-21T13:30:00.000Z", "2026-07-21T14:00:00.000Z", "2026-07-21T14:30:00.000Z"
    ]);
    expect(tx.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: { not: booking.id }, status: "CONFIRMED", techProfileId: "tech-1"
    }) }));
  });

  it("excludes other appointments and their buffers", async () => {
    tx.booking.findMany.mockResolvedValue([{ startAt: new Date("2026-07-21T14:00:00Z"), blockedUntilAt: new Date("2026-07-21T15:00:00Z") }]);
    expect((await getRescheduleAvailability(actor, booking.id, "2026-07", now)).slots).toEqual([]);
  });

  it("applies unavailable date overrides", async () => {
    tx.availabilityOverride.findMany.mockResolvedValue([{ localDate: new Date("2026-07-21"), kind: "UNAVAILABLE", windows: [] }]);
    expect((await getRescheduleAvailability(actor, booking.id, "2026-07", now)).slots).toEqual([]);
  });

  it.each([
    ["CANCELED", booking.startAt, "booking_canceled"],
    ["CONFIRMED", now, "booking_already_started"],
    ["CONFIRMED", new Date(now.getTime() + 120 * 60_000), "rescheduling_cutoff_passed"]
  ])("rejects ineligible booking %s/%s", async (status, startAt, code) => {
    tx.booking.findUnique.mockResolvedValue({ ...booking, status, startAt });
    await expect(getRescheduleAvailability(actor, booking.id, "2026-07", now)).rejects.toMatchObject({ status: 409, code });
    expect(tx.techScheduleSettings.findUnique).not.toHaveBeenCalled();
  });

  it("allows the owning tech after the customer cutoff", async () => {
    await expect(getRescheduleAvailability({ id: "owner-1", role: "TECH" }, booking.id, "2026-07",
      new Date("2026-07-21T12:30:00Z"))).resolves.toHaveProperty("slots");
  });

  it("rejects a stranger before loading schedule details", async () => {
    await expect(getRescheduleAvailability({ ...actor, id: "stranger" }, booking.id, "2026-07", now)).rejects.toMatchObject({ status: 403 });
    expect(tx.techScheduleSettings.findUnique).not.toHaveBeenCalled();
  });

  it("rejects missing bookings", async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    await expect(getRescheduleAvailability(actor, booking.id, "2026-07", now)).rejects.toMatchObject({ status: 404 });
  });

  it("does not load slots beyond the booking horizon", async () => {
    expect((await getRescheduleAvailability(actor, booking.id, "2026-09", now)).slots).toEqual([]);
    expect(tx.booking.findMany).not.toHaveBeenCalled();
  });
});
