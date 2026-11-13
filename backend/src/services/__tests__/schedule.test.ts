import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  techProfile: { findUnique: vi.fn() },
  techScheduleSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  weeklyAvailabilityWindow: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  availabilityOverride: { deleteMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
  booking: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn()
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import {
  deleteOwnOverride,
  getOwnSchedule,
  replaceOwnWeeklyAvailability,
  saveOwnScheduleSettings,
  upsertOwnOverride
} from "../schedule.service";
import {
  availabilityWindowSchema,
  bookingCalendarRangeSchema,
  overrideWriteSchema,
  scheduleSettingsSchema,
  weeklyAvailabilitySchema
} from "../../validations/schedule.schema";

const now = new Date("2026-07-20T12:00:00.000Z");
const settings = {
  timeZone: "America/New_York",
  minimumNoticeMinutes: 60,
  maximumAdvanceDays: 30,
  bufferMinutes: 15,
  cancellationCutoffMinutes: 120
};

describe("schedule settings and availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.techProfile.findUnique.mockResolvedValue({ id: "tech-1" });
    prisma.techScheduleSettings.findUnique.mockResolvedValue(settingsRecord());
    prisma.weeklyAvailabilityWindow.findMany.mockResolvedValue([]);
    prisma.availabilityOverride.findMany.mockResolvedValue([]);
    prisma.booking.findMany.mockResolvedValue([]);
  });

  it("enforces schedule policy suggestions and minute bounds", () => {
    expect(scheduleSettingsSchema.safeParse({ ...settings, maximumAdvanceDays: 366 }).success).toBe(false);
    expect(scheduleSettingsSchema.safeParse({ ...settings, bufferMinutes: 241 }).success).toBe(false);
    expect(availabilityWindowSchema.safeParse({ startMinute: 1440, endMinute: 1441 }).success).toBe(false);
    expect(availabilityWindowSchema.safeParse({ startMinute: 600, endMinute: 600 }).success).toBe(false);
  });

  it("strictly validates calendar range semantics at the controller boundary", () => {
    expect(bookingCalendarRangeSchema.safeParse({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z"
    }).success).toBe(true);
    expect(bookingCalendarRangeSchema.safeParse({
      from: "2026-07-02T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z"
    }).success).toBe(false);
    expect(bookingCalendarRangeSchema.safeParse({
      from: "2026-02-30T00:00:00.000Z",
      to: "2026-03-02T01:00:00.000Z"
    }).success).toBe(false);
  });

  it("rejects an invalid IANA zone before saving", async () => {
    await expect(saveOwnScheduleSettings("user-1", { ...settings, timeZone: "not/a-zone" })).rejects.toMatchObject({
      code: "invalid_time_zone"
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects overlapping weekly windows before opening a transaction", async () => {
    const weekly = weeklyAvailabilitySchema.parse([
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 720 }, { startMinute: 600, endMinute: 780 }] }
    ]);

    await expect(replaceOwnWeeklyAvailability("user-1", weekly, { now })).rejects.toMatchObject({
      code: "overlapping_availability"
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("replaces all owned weekly windows inside one transaction", async () => {
    prisma.weeklyAvailabilityWindow.findMany.mockResolvedValue([
      { weekday: 1, startMinute: 540, endMinute: 1020 }
    ]);

    const result = await replaceOwnWeeklyAvailability("user-1", [
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 1020 }] }
    ], { now });

    expect(result.weeklyAvailability).toEqual([{ weekday: 1, startMinute: 540, endMinute: 1020 }]);
    expect(prisma.weeklyAvailabilityWindow.deleteMany).toHaveBeenCalledWith({ where: { techProfileId: "tech-1" } });
    expect(prisma.weeklyAvailabilityWindow.createMany).toHaveBeenCalledWith({
      data: [{ techProfileId: "tech-1", weekday: 1, startMinute: 540, endMinute: 1020 }]
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("locks the stable tech profile row before deleting or inserting weekly windows", async () => {
    await replaceOwnWeeklyAvailability("user-1", [
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 720 }] }
    ], { now });

    const sql = prisma.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join("?")).toContain('SELECT "id" FROM "TechProfile" WHERE "id" = ? FOR UPDATE');
    expect(sql.values).toEqual(["tech-1"]);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.weeklyAvailabilityWindow.deleteMany.mock.invocationCallOrder[0]
    );
    expect(prisma.weeklyAvailabilityWindow.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.weeklyAvailabilityWindow.createMany.mock.invocationCallOrder[0]
    );
  });

  it("stores unavailable and custom-hour date overrides", async () => {
    prisma.availabilityOverride.upsert
      .mockResolvedValueOnce(overrideRecord({ kind: "UNAVAILABLE", windows: [] }))
      .mockResolvedValueOnce(overrideRecord({ kind: "CUSTOM_HOURS", windows: [{ startMinute: 600, endMinute: 780 }] }));

    await expect(upsertOwnOverride("user-1", "2026-07-21", overrideWriteSchema.parse({ kind: "unavailable" }), { now }))
      .resolves.toMatchObject({ kind: "unavailable", windows: [] });
    await expect(upsertOwnOverride(
      "user-1",
      "2026-07-22",
      overrideWriteSchema.parse({ kind: "custom", windows: [{ startMinute: 600, endMinute: 780 }] }),
      { now }
    )).resolves.toMatchObject({ kind: "custom", windows: [{ startMinute: 600, endMinute: 780 }] });
  });

  it("scopes override deletion to the authenticated tech profile", async () => {
    prisma.availabilityOverride.deleteMany.mockResolvedValue({ count: 1 });

    await deleteOwnOverride("user-1", "2026-07-21", { now });

    expect(prisma.availabilityOverride.deleteMany).toHaveBeenCalledWith({
      where: { techProfileId: "tech-1", localDate: new Date("2026-07-21T00:00:00.000Z") }
    });
  });

  it("returns warnings for confirmed bookings outside updated hours without mutating bookings", async () => {
    prisma.weeklyAvailabilityWindow.findMany.mockResolvedValue([{ weekday: 1, startMinute: 540, endMinute: 600 }]);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: "booking-1",
        startAt: new Date("2026-07-20T16:30:00.000Z"),
        endAt: new Date("2026-07-20T17:30:00.000Z"),
        timeZoneSnapshot: "America/Chicago"
      }
    ]);

    const result = await replaceOwnWeeklyAvailability("user-1", [
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 600 }] }
    ], { now });

    expect(result.warnings).toEqual([{
      bookingId: "booking-1",
      startAt: "2026-07-20T16:30:00.000Z",
      timeZoneSnapshot: "America/Chicago",
      message: "Existing booking falls outside the updated availability"
    }]);
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: { techProfileId: "tech-1", status: "CONFIRMED", startAt: { gte: now } },
      select: { id: true, startAt: true, endAt: true, timeZoneSnapshot: true }
    });
    expect((prisma.booking as Record<string, unknown>).update).toBeUndefined();
  });

  it("returns the saved schedule state for its owner", async () => {
    prisma.weeklyAvailabilityWindow.findMany.mockResolvedValue([{ weekday: 1, startMinute: 540, endMinute: 1020 }]);
    prisma.availabilityOverride.findMany.mockResolvedValue([overrideRecord({ windows: [{ startMinute: 600, endMinute: 780 }] })]);

    await expect(getOwnSchedule("user-1")).resolves.toEqual({
      settings,
      weeklyAvailability: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      overrides: [{ localDate: "2026-07-21", kind: "custom", windows: [{ startMinute: 600, endMinute: 780 }] }]
    });
  });
});

function settingsRecord() {
  return { id: "settings-1", techProfileId: "tech-1", ...settings, createdAt: now, updatedAt: now };
}

function overrideRecord(overrides: { kind?: "UNAVAILABLE" | "CUSTOM_HOURS"; windows?: Array<{ startMinute: number; endMinute: number }> }) {
  return {
    id: "override-1", techProfileId: "tech-1", localDate: new Date("2026-07-21T00:00:00.000Z"),
    kind: "CUSTOM_HOURS" as const, windows: [], createdAt: now, updatedAt: now, ...overrides
  };
}
