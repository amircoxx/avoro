import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  booking: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn() },
  techProfile: { findFirst: vi.fn() },
  weeklyAvailabilityWindow: { findMany: vi.fn() },
  availabilityOverride: { findUnique: vi.fn() }
}));

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  booking: { findUnique: vi.fn() }
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import { createBooking, isBookingOverlapError } from "../booking.service";

const customerId = "be01c6b7-77dc-4599-b7ad-40c09ce890f8";
const techUserId = "93350160-c359-4707-a490-84ea6d679818";
const techProfileId = "12dcb560-d78f-4c0f-a228-581b871d8db6";
const serviceId = "3754164f-7c66-4c13-ad80-f810453c07f5";
const requestKey = "b11e428e-58c5-4acc-ae40-74ec00fe39d8";
const now = new Date("2026-07-20T12:00:00.000Z");
const startAt = "2026-07-21T13:00:00.000Z";

const input = { techProfileId, serviceId, startAt, requestKey };

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: techProfileId,
    userId: techUserId,
    businessName: "Gloss Room",
    displayName: "Maya",
    user: { email: "maya@example.com" },
    scheduleSettings: {
      timeZone: "America/New_York",
      minimumNoticeMinutes: 60,
      maximumAdvanceDays: 2,
      bufferMinutes: 30,
      cancellationCutoffMinutes: 120
    },
    services: [{
      id: serviceId,
      name: "Gel-X Full Set",
      durationMinutes: 60,
      startingPriceCents: 8500,
      isActive: true
    }],
    ...overrides
  };
}

function bookingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "84cf2c36-8c3e-4e1f-899b-5f400c6c115e",
    techProfileId,
    customerId,
    techServiceId: serviceId,
    requestKey,
    serviceNameSnapshot: "Gel-X Full Set",
    durationMinutesSnapshot: 60,
    startingPriceCentsSnapshot: 8500,
    timeZoneSnapshot: "America/New_York",
    cancellationCutoffMinutesSnapshot: 120,
    startAt: new Date(startAt),
    endAt: new Date("2026-07-21T14:00:00.000Z"),
    blockedUntilAt: new Date("2026-07-21T14:30:00.000Z"),
    status: "CONFIRMED",
    canceledAt: null,
    canceledByUserId: null,
    createdAt: now,
    updatedAt: now,
    techProfile: { id: techProfileId, businessName: "Gloss Room", displayName: "Maya" },
    customer: { id: customerId, fullName: "Jordan", email: "jordan@example.com" },
    ...overrides
  };
}

describe("createBooking", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown, options: unknown) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return callback(tx);
    });
    tx.booking.findUnique.mockResolvedValue(null);
    tx.user.findUnique.mockResolvedValue({ id: customerId, email: "jordan@example.com", fullName: "Jordan" });
    tx.techProfile.findFirst.mockResolvedValue(profile());
    tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([{ weekday: 2, startMinute: 540, endMinute: 720 }]);
    tx.availabilityOverride.findUnique.mockResolvedValue(null);
    tx.booking.findMany.mockResolvedValue([]);
    tx.booking.create.mockResolvedValue(bookingRecord());
    prisma.booking.findUnique.mockResolvedValue(null);
  });

  it("returns the exact customer request-key booking as a replay without creating side effects", async () => {
    tx.booking.findUnique.mockResolvedValue(bookingRecord());

    const result = await createBooking(customerId, { ...input, techProfileId: crypto.randomUUID() }, now);

    expect(result).toMatchObject({ replayed: true, booking: { id: bookingRecord().id } });
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it("returns the winner when concurrent writes race on the same customer request key", async () => {
    prisma.$transaction.mockRejectedValueOnce(prismaError("P2002", {
      modelName: "Booking",
      target: ["customerId", "requestKey"]
    }));
    prisma.booking.findUnique.mockResolvedValue(bookingRecord());

    const result = await createBooking(customerId, input, now);

    expect(result).toMatchObject({ replayed: true, booking: { id: bookingRecord().id } });
    expect(prisma.booking.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId_requestKey: { customerId, requestKey } }
    }));
  });

  it("returns the same-key winner before translating its overlapping transaction failure", async () => {
    prisma.$transaction.mockRejectedValueOnce(prismaError("P2004", {
      database_error: 'constraint "Booking_no_confirmed_overlap" violated'
    }));
    prisma.booking.findUnique.mockResolvedValue(bookingRecord());

    const result = await createBooking(customerId, input, now);

    expect(result).toMatchObject({ replayed: true, booking: { id: bookingRecord().id } });
  });

  it("retries the entire Serializable transaction after P2034 and succeeds", async () => {
    const writeConflict = prismaError("P2034", {});
    tx.booking.create.mockRejectedValueOnce(writeConflict).mockResolvedValueOnce(bookingRecord());

    const result = await createBooking(customerId, input, now);

    expect(result).toMatchObject({ replayed: false, booking: { id: bookingRecord().id } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.booking.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.user.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.booking.create).toHaveBeenCalledTimes(2);
  });

  it("stops after three total P2034 attempts and preserves the final conflict", async () => {
    const writeConflict = prismaError("P2034", {});
    tx.booking.create.mockRejectedValue(writeConflict);

    await expect(createBooking(customerId, input, now)).rejects.toBe(writeConflict);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(tx.booking.findUnique).toHaveBeenCalledTimes(3);
    expect(tx.user.findUnique).toHaveBeenCalledTimes(3);
    expect(prisma.booking.findUnique).toHaveBeenCalledTimes(3);
  });

  it("reloads the request key but preserves an unrelated failure when no winner exists", async () => {
    const unrelated = new Error("connection closed");
    prisma.$transaction.mockRejectedValueOnce(unrelated);
    prisma.booking.findUnique.mockResolvedValue(null);

    await expect(createBooking(customerId, input, now)).rejects.toBe(unrelated);
    expect(prisma.booking.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId_requestKey: { customerId, requestKey } }
    }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("uses current server values for the booking snapshots and creates both confirmation outbox rows", async () => {
    const untrustedInput = {
      ...input,
      durationMinutes: 5,
      startingPriceCents: 1,
      endAt: "2026-07-21T13:05:00.000Z",
      bufferMinutes: 0
    };

    const result = await createBooking(customerId, untrustedInput, now);

    expect(result).toEqual({
      replayed: false,
      booking: expect.objectContaining({
        id: bookingRecord().id,
        serviceName: "Gel-X Full Set",
        durationMinutes: 60,
        startingPriceCents: 8500,
        startAt,
        endAt: "2026-07-21T14:00:00.000Z",
        blockedUntilAt: "2026-07-21T14:30:00.000Z",
        timeZone: "America/New_York",
        canCancel: true,
        tech: { id: techProfileId, businessName: "Gloss Room", displayName: "Maya" },
        customer: { id: customerId, displayName: "Jordan" }
      })
    });
    const createCall = tx.booking.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      techProfileId,
      customerId,
      techServiceId: serviceId,
      requestKey,
      serviceNameSnapshot: "Gel-X Full Set",
      durationMinutesSnapshot: 60,
      startingPriceCentsSnapshot: 8500,
      timeZoneSnapshot: "America/New_York",
      cancellationCutoffMinutesSnapshot: 120,
      startAt: new Date(startAt),
      endAt: new Date("2026-07-21T14:00:00.000Z"),
      blockedUntilAt: new Date("2026-07-21T14:30:00.000Z")
    });
    expect(createCall.data).not.toMatchObject({ durationMinutes: 5, startingPriceCents: 1, bufferMinutes: 0 });
    expect(createCall.data.notifications.create).toHaveLength(2);
    expect(createCall.data.notifications.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipientEmail: "jordan@example.com", messageKind: "BOOKING_CONFIRMED", payload: expect.objectContaining({ recipientRole: "CUSTOMER" }) }),
      expect.objectContaining({ recipientEmail: "maya@example.com", messageKind: "BOOKING_CONFIRMED", payload: expect.objectContaining({ recipientRole: "TECH" }) })
    ]));
  });

  it("revalidates the selected start against the current schedule", async () => {
    tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([]);

    await expect(createBooking(customerId, input, now)).rejects.toMatchObject({ status: 409, code: "booking_conflict" });

    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive or unknown service", async () => {
    tx.techProfile.findFirst.mockResolvedValue(profile({ services: [] }));

    await expect(createBooking(customerId, input, now)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects a service missing required duration or price", async () => {
    tx.techProfile.findFirst.mockResolvedValue(profile({
      services: [{ id: serviceId, name: "Legacy", durationMinutes: null, startingPriceCents: null, isActive: true }]
    }));

    await expect(createBooking(customerId, input, now)).rejects.toMatchObject({ status: 409, code: "service_not_bookable" });
  });

  it("rejects booking the customer's own tech profile", async () => {
    tx.techProfile.findFirst.mockResolvedValue(profile({ userId: customerId }));

    await expect(createBooking(customerId, input, now)).rejects.toMatchObject({ status: 409, code: "self_booking_not_allowed" });
  });

  it("maps the named confirmed-overlap exclusion error from Prisma and Postgres", async () => {
    const overlap = prismaError("P2004", { database_error: 'constraint "Booking_no_confirmed_overlap" violated' });
    const postgresOverlap = new Prisma.PrismaClientUnknownRequestError(
      'Postgres error 23P01: conflicting key violates exclusion constraint "Booking_no_confirmed_overlap"',
      { clientVersion: "test" }
    );
    const unrelated = prismaError("P2004", { database_error: 'constraint "Booking_valid_range" violated' });
    const similarlyPrefixed = prismaError("P2004", {
      database_error: 'constraint "Booking_no_confirmed_overlap_archive" violated'
    });

    expect(isBookingOverlapError(overlap)).toBe(true);
    expect(isBookingOverlapError(postgresOverlap)).toBe(true);
    expect(isBookingOverlapError(unrelated)).toBe(false);
    expect(isBookingOverlapError(similarlyPrefixed)).toBe(false);
    tx.booking.create.mockRejectedValue(overlap);

    await expect(createBooking(customerId, input, now)).rejects.toMatchObject({
      status: 409,
      code: "booking_conflict",
      message: "That time is no longer available"
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

function prismaError(code: string, meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("Database constraint failed", {
    code,
    clientVersion: "test",
    meta
  });
}
