import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  techProfile: { findFirst: vi.fn() },
  booking: { findMany: vi.fn() }
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import { getPublicAvailability } from "../availability.service";
import { techRouter } from "../../routes/tech.routes";

const now = new Date("2026-07-20T12:00:00.000Z");
const service = { id: "5d90a5b4-7632-42f6-8331-4bd760a79b44", name: "Gel-X Full Set", durationMinutes: 60, startingPriceCents: 8500 };

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "tech-1",
    scheduleSettings: {
      timeZone: "America/New_York", minimumNoticeMinutes: 60, maximumAdvanceDays: 2,
      bufferMinutes: 30, cancellationCutoffMinutes: 60
    },
    services: [service],
    weeklyAvailability: [{ weekday: 2, startMinute: 9 * 60, endMinute: 12 * 60 }],
    availabilityOverrides: [],
    ...overrides
  };
}

describe("public availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.booking.findMany.mockResolvedValue([]);
  });

  it("does not expose an unpublished tech", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(null);
    await expect(getPublicAvailability("tech-1", service.id, "2026-07", now)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects a service without the duration and price required for booking", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(profile({ services: [{ ...service, durationMinutes: null }] }));
    await expect(getPublicAvailability("tech-1", service.id, "2026-07", now)).rejects.toMatchObject({ status: 409, code: "service_not_bookable" });
  });

  it("returns no slots for a configured but closed schedule", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(profile({ weeklyAvailability: [] }));
    await expect(getPublicAvailability("tech-1", service.id, "2026-07", now)).resolves.toEqual(expect.objectContaining({ slots: [] }));
  });

  it("returns public service data and slots clipped by the notice and horizon", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(profile());
    const result = await getPublicAvailability("tech-1", service.id, "2026-07", now);

    expect(result).toEqual({
      month: "2026-07",
      timeZone: "America/New_York",
      cancellationCutoffMinutes: 60,
      service,
      slots: [
        { startAt: "2026-07-21T13:00:00.000Z", localDate: "2026-07-21", localTime: "9:00 AM", timeZone: "America/New_York" },
        { startAt: "2026-07-21T13:30:00.000Z", localDate: "2026-07-21", localTime: "9:30 AM", timeZone: "America/New_York" },
        { startAt: "2026-07-21T14:00:00.000Z", localDate: "2026-07-21", localTime: "10:00 AM", timeZone: "America/New_York" },
        { startAt: "2026-07-21T14:30:00.000Z", localDate: "2026-07-21", localTime: "10:30 AM", timeZone: "America/New_York" }
      ]
    });
    expect(result).not.toHaveProperty("bookings");
    expect(result).not.toHaveProperty("scheduleSettings");
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ techProfileId: "tech-1", status: "CONFIRMED" }),
      select: { startAt: true, blockedUntilAt: true }
    }));
  });

  it("returns no slots when the requested month does not intersect the booking horizon", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(profile());
    await expect(getPublicAvailability("tech-1", service.id, "2026-09", now)).resolves.toEqual({
      month: "2026-09", timeZone: "America/New_York", cancellationCutoffMinutes: 60, service, slots: []
    });
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("loads confirmed bookings through the max blocked duration after the local month boundary", async () => {
    prisma.techProfile.findFirst.mockResolvedValue(profile({
      scheduleSettings: {
        timeZone: "America/New_York", minimumNoticeMinutes: 0, maximumAdvanceDays: 40,
        bufferMinutes: 30, cancellationCutoffMinutes: 60
      },
      services: [{ ...service, durationMinutes: 60 }],
      weeklyAvailability: [{ weekday: 5, startMinute: 9 * 60, endMinute: 12 * 60 }]
    }));

    await getPublicAvailability("tech-1", service.id, "2026-07", new Date("2026-07-01T12:00:00.000Z"));

    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        startAt: { lt: new Date("2026-08-01T05:30:00.000Z") }
      })
    }));
  });
});

describe("public availability route", () => {
  it("registers availability before the generic tech profile route", () => {
    const routes = techRouter.stack.flatMap((layer) => layer.route ? [layer.route.path] : []);

    expect(routes.indexOf("/:techId/availability")).toBeLessThan(routes.indexOf("/:techId"));
  });
});
