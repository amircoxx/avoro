import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "../../utils/errors";

const tx = vi.hoisted(() => ({
  booking: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  bookingReschedule: { findUnique: vi.fn(), create: vi.fn() },
  techScheduleSettings: { findUnique: vi.fn() },
  weeklyAvailabilityWindow: { findMany: vi.fn() },
  availabilityOverride: { findUnique: vi.fn() },
  notificationOutbox: { createMany: vi.fn() }
}));
const prisma = vi.hoisted(() => ({
  booking: { findMany: vi.fn() },
  techProfile: { findUnique: vi.fn() },
  $transaction: vi.fn()
}));

vi.mock("../../models/database.model", () => ({ prisma }));

import { cancelBooking, listCustomerBookings, rescheduleBooking } from "../booking.service";
import { listOwnCalendarBookings } from "../schedule.service";

const customerId = "be01c6b7-77dc-4599-b7ad-40c09ce890f8";
const otherCustomerId = "5e455f4c-9cf9-4312-a7aa-4d327dbbc9d6";
const techUserId = "93350160-c359-4707-a490-84ea6d679818";
const techProfileId = "12dcb560-d78f-4c0f-a228-581b871d8db6";
const bookingId = "84cf2c36-8c3e-4e1f-899b-5f400c6c115e";
const now = new Date("2026-07-20T12:00:00.000Z");

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: bookingId,
    techProfileId,
    customerId,
    techServiceId: "3754164f-7c66-4c13-ad80-f810453c07f5",
    requestKey: "b11e428e-58c5-4acc-ae40-74ec00fe39d8",
    version: 0,
    serviceNameSnapshot: "Gel-X Full Set",
    durationMinutesSnapshot: 60,
    startingPriceCentsSnapshot: 8500,
    timeZoneSnapshot: "America/New_York",
    cancellationCutoffMinutesSnapshot: 120,
    startAt: new Date("2026-07-21T13:00:00.000Z"),
    endAt: new Date("2026-07-21T14:00:00.000Z"),
    blockedUntilAt: new Date("2026-07-21T14:30:00.000Z"),
    status: "CONFIRMED",
    canceledAt: null,
    canceledByUserId: null,
    createdAt: now,
    updatedAt: now,
    techProfile: {
      id: techProfileId,
      userId: techUserId,
      businessName: "Gloss Room",
      displayName: "Maya",
      user: { email: "maya@example.com" }
    },
    customer: { id: customerId, fullName: "Jordan", email: "jordan@example.com" },
    ...overrides
  };
}

describe("booking lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.booking.findUnique.mockResolvedValue(booking());
    tx.bookingReschedule.findUnique.mockResolvedValue(null);
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.notificationOutbox.createMany.mockResolvedValue({ count: 2 });
    prisma.techProfile.findUnique.mockResolvedValue({
      id: techProfileId,
      userId: techUserId,
      scheduleSettings: { timeZone: "America/Chicago" }
    });
  });

  it.each([
    { label: "canceled booking", overrides: { status: "CANCELED" }, code: "booking_canceled" },
    { label: "exact appointment start", overrides: { startAt: now }, code: "booking_already_started" },
    { label: "past appointment", overrides: { startAt: new Date(now.getTime() - 1) }, code: "booking_already_started" },
    { label: "exact customer cutoff", overrides: { startAt: new Date(now.getTime() + 120 * 60_000) }, code: "rescheduling_cutoff_passed" },
    { label: "stale version", overrides: { version: 1 }, code: "booking_version_conflict" }
  ])("rejects rescheduling at $label", async ({ overrides, code }) => {
    tx.booking.findUnique.mockResolvedValue(booking(overrides));

    await expect(rescheduleBooking({ id: customerId, role: "CUSTOMER" }, bookingId, {
      startAt: "2026-07-22T13:00:00.000Z",
      version: 0,
      requestKey: "32e724ab-1f46-43f8-868c-b46a924fb534"
    }, now)).rejects.toMatchObject({ status: 409, code });
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("queues customer and tech rescheduling notifications once with old and new times", async () => {
    const original = booking();
    const moved = booking({
      startAt: new Date("2026-07-22T13:00:00.000Z"),
      endAt: new Date("2026-07-22T14:00:00.000Z"),
      blockedUntilAt: new Date("2026-07-22T14:30:00.000Z"),
      version: 1
    });
    const input = {
      startAt: moved.startAt.toISOString(),
      version: 0,
      requestKey: "32e724ab-1f46-43f8-868c-b46a924fb534"
    };
    const history = {
      id: "reschedule-1",
      changedByUserId: customerId,
      newStartAt: moved.startAt,
      oldStartAt: original.startAt,
      oldEndAt: original.endAt,
      reason: null
    };
    tx.booking.findUnique.mockResolvedValueOnce(original).mockResolvedValue(moved);
    tx.techScheduleSettings.findUnique.mockResolvedValue({
      timeZone: "America/New_York", bufferMinutes: 30,
      minimumNoticeMinutes: 60, maximumAdvanceDays: 30
    });
    tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([
      { weekday: 3, startMinute: 540, endMinute: 1020 }
    ]);
    tx.availabilityOverride.findUnique.mockResolvedValue(null);
    tx.booking.findMany.mockResolvedValue([]);
    tx.bookingReschedule.create.mockResolvedValue(history);

    const result = await rescheduleBooking({ id: customerId, role: "CUSTOMER" }, bookingId, input, now);
    expect(result).toMatchObject({ replayed: false, booking: { version: 1 } });
    const details = {
      bookingId, customerName: "Jordan", techName: "Maya", serviceName: "Gel-X Full Set",
      startAt: moved.startAt.toISOString(), endAt: moved.endAt.toISOString(),
      oldStartAt: original.startAt.toISOString(), oldEndAt: original.endAt.toISOString(),
      timeZone: "America/New_York", durationMinutes: 60,
      startingPriceCents: 8500, cancellationCutoffMinutes: 120
    };
    expect(tx.notificationOutbox.createMany).toHaveBeenCalledExactlyOnceWith({ data: [
      {
        bookingId, eventKey: "reschedule-1:rescheduled:customer", messageKind: "BOOKING_RESCHEDULED",
        recipientEmail: "jordan@example.com", recipientName: "Jordan",
        payload: { ...details, recipientRole: "CUSTOMER" }
      },
      {
        bookingId, eventKey: "reschedule-1:rescheduled:tech", messageKind: "BOOKING_RESCHEDULED",
        recipientEmail: "maya@example.com", recipientName: "Maya",
        payload: { ...details, recipientRole: "TECH" }
      }
    ] });

    tx.bookingReschedule.findUnique.mockResolvedValue(history);
    const replay = await rescheduleBooking({ id: customerId, role: "CUSTOMER" }, bookingId, input, now);
    expect(replay).toMatchObject({ replayed: true });
    expect(tx.notificationOutbox.createMany).toHaveBeenCalledTimes(1);
  });

  describe("rescheduling rules", () => {
    const input = {
      startAt: "2026-07-22T13:00:00.000Z",
      version: 0,
      requestKey: "32e724ab-1f46-43f8-868c-b46a924fb534",
      reason: "Schedule changed"
    };
    const actor = { id: customerId, role: "CUSTOMER" as const };

    beforeEach(() => {
      tx.techScheduleSettings.findUnique.mockResolvedValue({
        timeZone: "America/New_York", bufferMinutes: 15,
        minimumNoticeMinutes: 60, maximumAdvanceDays: 30
      });
      tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([
        { weekday: 3, startMinute: 540, endMinute: 1020 }
      ]);
      tx.availabilityOverride.findUnique.mockResolvedValue(null);
      tx.booking.findMany.mockResolvedValue([]);
      tx.bookingReschedule.create.mockResolvedValue({
        id: "move-1", oldStartAt: booking().startAt, oldEndAt: booking().endAt
      });
      tx.booking.findUnique.mockResolvedValueOnce(booking()).mockResolvedValue(booking({
        version: 1, startAt: new Date(input.startAt),
        endAt: new Date("2026-07-22T14:00:00Z"),
        blockedUntilAt: new Date("2026-07-22T14:15:00Z")
      }));
    });

    it("saves history and increments the version using saved duration and current buffer", async () => {
      await rescheduleBooking(actor, bookingId, input, now);
      expect(tx.booking.updateMany).toHaveBeenCalledWith({
        where: { id: bookingId, version: 0, status: "CONFIRMED" },
        data: {
          startAt: new Date(input.startAt), endAt: new Date("2026-07-22T14:00:00Z"),
          blockedUntilAt: new Date("2026-07-22T14:15:00Z"), version: { increment: 1 }
        }
      });
      expect(tx.bookingReschedule.create).toHaveBeenCalledWith({ data: {
        bookingId, changedByUserId: customerId, requestKey: input.requestKey,
        oldStartAt: booking().startAt, oldEndAt: booking().endAt,
        oldBlockedUntilAt: booking().blockedUntilAt,
        newStartAt: new Date(input.startAt), newEndAt: new Date("2026-07-22T14:00:00Z"),
        newBlockedUntilAt: new Date("2026-07-22T14:15:00Z"), reason: input.reason
      } });
      expect(tx.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
        techProfileId, status: "CONFIRMED", id: { not: bookingId },
        startAt: { lt: new Date("2026-07-22T14:15:00Z") },
        blockedUntilAt: { gt: new Date(input.startAt) }
      } }));
    });

    it("allows the owning tech after the customer cutoff", async () => {
      await expect(rescheduleBooking({ id: techUserId, role: "TECH" }, bookingId, input,
        new Date("2026-07-21T12:30:00Z"))).resolves.toMatchObject({ replayed: false });
    });

    it.each([
      { id: otherCustomerId, role: "CUSTOMER" as const },
      { id: otherCustomerId, role: "TECH" as const },
      { id: customerId, role: "TECH" as const }
    ])("rejects an actor without booking ownership: $role/$id", async (unauthorized) => {
      await expect(rescheduleBooking(unauthorized, bookingId, input, now))
        .rejects.toMatchObject({ status: 403 });
      expect(tx.bookingReschedule.findUnique).not.toHaveBeenCalled();
      expect(tx.booking.updateMany).not.toHaveBeenCalled();
    });

    it("rejects a missing booking", async () => {
      tx.booking.findUnique.mockReset().mockResolvedValue(null);
      await expect(rescheduleBooking(actor, bookingId, input, now)).rejects.toMatchObject({ status: 404 });
    });

    it.each([
      { changedByUserId: techUserId },
      { newStartAt: new Date("2026-07-23T13:00:00Z") },
      { reason: "Different reason" }
    ])("rejects request-key reuse with changed data %j", async (changed) => {
      tx.bookingReschedule.findUnique.mockResolvedValue({
        changedByUserId: customerId, newStartAt: new Date(input.startAt), reason: input.reason, ...changed
      });
      await expect(rescheduleBooking(actor, bookingId, input, now))
        .rejects.toMatchObject({ status: 409, code: "request_key_conflict" });
      expect(tx.booking.updateMany).not.toHaveBeenCalled();
    });

    it.each(["outside hours", "blocked", "unavailable override", "minimum notice", "advance limit"])(
      "rejects unavailable times: %s", async (scenario) => {
        if (scenario === "outside hours") tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([]);
        if (scenario === "blocked") tx.booking.findMany.mockResolvedValue([
          { startAt: new Date("2026-07-22T12:30:00Z"), blockedUntilAt: new Date("2026-07-22T13:15:00Z") }
        ]);
        if (scenario === "unavailable override") tx.availabilityOverride.findUnique.mockResolvedValue({
          localDate: new Date("2026-07-22T00:00:00Z"), kind: "UNAVAILABLE", windows: []
        });
        if (scenario === "minimum notice" || scenario === "advance limit") {
          tx.techScheduleSettings.findUnique.mockResolvedValue({
            timeZone: "America/New_York", bufferMinutes: 15,
            minimumNoticeMinutes: scenario === "minimum notice" ? 3000 : 60,
            maximumAdvanceDays: scenario === "advance limit" ? 1 : 30
          });
        }
        await expect(rescheduleBooking(actor, bookingId, input, now))
          .rejects.toMatchObject({ status: 409, code: "booking_conflict" });
        expect(tx.booking.updateMany).not.toHaveBeenCalled();
        expect(tx.bookingReschedule.create).not.toHaveBeenCalled();
        expect(tx.notificationOutbox.createMany).not.toHaveBeenCalled();
      }
    );

    it("accepts an available override when there are no weekly hours", async () => {
      tx.weeklyAvailabilityWindow.findMany.mockResolvedValue([]);
      tx.availabilityOverride.findUnique.mockResolvedValue({
        localDate: new Date("2026-07-22T00:00:00Z"), kind: "CUSTOM_HOURS",
        windows: [{ startMinute: 540, endMinute: 1020 }]
      });
      await expect(rescheduleBooking(actor, bookingId, input, now)).resolves.toMatchObject({ replayed: false });
    });

    it("rejects missing schedule settings before writing", async () => {
      tx.techScheduleSettings.findUnique.mockResolvedValue(null);
      await expect(rescheduleBooking(actor, bookingId, input, now))
        .rejects.toMatchObject({ code: "availability_not_configured" });
      expect(tx.booking.updateMany).not.toHaveBeenCalled();
    });

    it("does not save history or notifications when the guarded update loses a race", async () => {
      tx.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(rescheduleBooking(actor, bookingId, input, now)).rejects.toMatchObject({ status: 409 });
      expect(tx.bookingReschedule.create).not.toHaveBeenCalled();
      expect(tx.notificationOutbox.createMany).not.toHaveBeenCalled();
    });

    it("propagates an outbox write failure to the transaction caller", async () => {
      const error = new Error("outbox unavailable");
      tx.notificationOutbox.createMany.mockRejectedValue(error);
      await expect(rescheduleBooking(actor, bookingId, input, now)).rejects.toBe(error);
    });
  });

  it("bounds serializable retries and returns a stable conflict after exhaustion", async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("retry", {
      code: "P2034", clientVersion: "test"
    }));
    await expect(rescheduleBooking({ id: customerId, role: "CUSTOMER" }, bookingId, {
      startAt: "2026-07-22T13:00:00Z", version: 0, requestKey: "retry-key"
    }, now)).rejects.toMatchObject({ status: 409, code: "booking_version_conflict" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("does not cancel a booking that moved after the cancellation checks", async () => {
    tx.booking.updateMany.mockResolvedValue({ count: 0 });
    tx.booking.findUnique.mockResolvedValueOnce(booking()).mockResolvedValueOnce(booking({ version: 1 }));
    await expect(cancelBooking({ id: customerId, role: "CUSTOMER" }, bookingId, now)).rejects.toMatchObject({ status: 409 });
    expect(tx.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("returns only the customer's bookings grouped in upcoming, past, and canceled order", async () => {
    const upcomingLater = booking({ id: "upcoming-later", startAt: new Date("2026-07-22T13:00:00.000Z") });
    const upcomingSooner = booking({ id: "upcoming-sooner", startAt: new Date("2026-07-21T13:00:00.000Z") });
    const pastOlder = booking({ id: "past-older", startAt: new Date("2026-07-18T13:00:00.000Z") });
    const pastNewer = booking({ id: "past-newer", startAt: new Date("2026-07-19T13:00:00.000Z") });
    const canceled = booking({ id: "canceled", status: "CANCELED", canceledAt: now });
    prisma.booking.findMany.mockResolvedValue([upcomingLater, pastOlder, canceled, upcomingSooner, pastNewer]);

    const result = await listCustomerBookings(customerId, now);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId },
      include: expect.any(Object)
    }));
    expect(result).toMatchObject({
      upcoming: [{ id: "upcoming-sooner" }, { id: "upcoming-later" }],
      past: [{ id: "past-newer" }, { id: "past-older" }],
      canceled: [{ id: "canceled", status: "CANCELED" }]
    });
  });

  it("returns only the owner's confirmed and canceled calendar rows with current and snapshot timezone labels", async () => {
    prisma.booking.findMany.mockResolvedValue([booking()]);

    const result = await listOwnCalendarBookings(techUserId, {
      from: "2026-07-20T00:00:00.000-04:00",
      to: "2026-07-27T00:00:00.000-04:00"
    }, now);

    expect(prisma.techProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: techUserId },
      select: expect.any(Object)
    });
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        techProfileId,
        startAt: { gte: new Date("2026-07-20T04:00:00.000Z"), lt: new Date("2026-07-27T04:00:00.000Z") },
        status: { in: ["CONFIRMED", "CANCELED"] }
      }
    }));
    expect(result).toEqual([expect.objectContaining({
      id: bookingId,
      customer: { id: customerId, displayName: "Jordan", email: "jordan@example.com" },
      timeZone: "America/New_York",
      currentTimeZone: "America/Chicago"
    })]);
  });

  it("rejects calendar ranges longer than 93 days", async () => {
    await expect(listOwnCalendarBookings(techUserId, {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-10-03T00:00:00.000Z"
    })).rejects.toMatchObject({ status: 400, code: "invalid_booking_range" });
    expect(prisma.techProfile.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a calendar range exactly 93 elapsed days long", async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    await expect(listOwnCalendarBookings(techUserId, {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z"
    })).resolves.toEqual([]);
    expect(prisma.techProfile.findUnique).toHaveBeenCalledOnce();
  });

  it.each([
    ["inverted", { from: "2026-07-02T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" }],
    ["invalid-calendar-date", { from: "2026-02-30T00:00:00.000Z", to: "2026-03-02T01:00:00.000Z" }]
  ])("rejects %s calendar ranges before database access", async (_label, range) => {
    await expect(listOwnCalendarBookings(techUserId, range)).rejects.toMatchObject({
      status: 400,
      code: "invalid_booking_range"
    });
    expect(prisma.techProfile.findUnique).not.toHaveBeenCalled();
  });

  it("cancels a customer booking strictly before the snapshotted cutoff and emits two atomic events", async () => {
    const canonicalUpdatedAt = new Date("2026-07-20T12:00:00.250Z");
    tx.booking.findUnique
      .mockResolvedValueOnce(booking())
      .mockResolvedValueOnce(booking({ status: "CANCELED", canceledAt: now, canceledByUserId: customerId, updatedAt: canonicalUpdatedAt }));
    const result = await cancelBooking({ id: customerId, role: "CUSTOMER" }, bookingId, now);

    expect(result).toMatchObject({
      id: bookingId,
      status: "CANCELED",
      canCancel: false,
      updatedAt: canonicalUpdatedAt.toISOString()
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: bookingId, status: "CONFIRMED", version: 0 },
      data: { status: "CANCELED", canceledAt: now, canceledByUserId: customerId, version: { increment: 1 } }
    });
    expect(tx.notificationOutbox.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ eventKey: `${bookingId}:cancellation:customer`, messageKind: "BOOKING_CANCELED" }),
        expect.objectContaining({ eventKey: `${bookingId}:cancellation:tech`, messageKind: "BOOKING_CANCELED" })
      ])
    }));
    expect(tx.booking.findUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects a customer at the exact cancellation deadline", async () => {
    const deadline = new Date("2026-07-21T11:00:00.000Z");

    await expect(cancelBooking({ id: customerId, role: "CUSTOMER" }, bookingId, deadline))
      .rejects.toMatchObject({ status: 409, code: "cancellation_cutoff_passed" });
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it("allows the owning tech to cancel before start even after the customer cutoff", async () => {
    const afterCustomerDeadline = new Date("2026-07-21T12:30:00.000Z");
    tx.booking.findUnique
      .mockResolvedValueOnce(booking())
      .mockResolvedValueOnce(booking({ status: "CANCELED", canceledAt: afterCustomerDeadline, canceledByUserId: techUserId }));

    await expect(cancelBooking({ id: techUserId, role: "TECH" }, bookingId, afterCustomerDeadline))
      .resolves.toMatchObject({ id: bookingId, status: "CANCELED" });
    expect(tx.booking.updateMany).toHaveBeenCalled();
  });

  it("rejects cancellations after a booking starts", async () => {
    await expect(cancelBooking({ id: techUserId, role: "TECH" }, bookingId, new Date("2026-07-21T13:00:00.000Z")))
      .rejects.toMatchObject({ status: 409, code: "booking_already_started" });
  });

  it("forbids a user who owns neither side of the booking", async () => {
    await expect(cancelBooking({ id: otherCustomerId, role: "CUSTOMER" }, bookingId, now))
      .rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it("returns an already canceled booking without duplicate outbox rows", async () => {
    tx.booking.findUnique.mockResolvedValue(booking({ status: "CANCELED", canceledAt: now, canceledByUserId: customerId }));

    const result = await cancelBooking({ id: customerId, role: "CUSTOMER" }, bookingId, now);

    expect(result).toMatchObject({ id: bookingId, status: "CANCELED" });
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("treats a lost confirmed-status update as an idempotent cancellation without duplicate events", async () => {
    tx.booking.updateMany.mockResolvedValue({ count: 0 });
    tx.booking.findUnique.mockResolvedValueOnce(booking()).mockResolvedValueOnce(booking({ status: "CANCELED", canceledAt: now }));

    await expect(cancelBooking({ id: customerId, role: "CUSTOMER" }, bookingId, now))
      .resolves.toMatchObject({ id: bookingId, status: "CANCELED" });
    expect(tx.notificationOutbox.createMany).not.toHaveBeenCalled();
  });
});

describe("lifecycle error contract", () => {
  it("uses stable error codes", () => {
    expect(new AppError("", 409, "cancellation_cutoff_passed").code).toBe("cancellation_cutoff_passed");
  });
});
