/** Creates confirmed bookings from fresh server-owned scheduling data. */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import type { z } from "zod";
import { prisma } from "../models/database.model";
import { AppError, isRecord } from "../utils/errors";
import { createBookingSchema, rescheduleBookingSchema } from "../validations/booking.schema";
import { bookingDisplayInclude, toBookingDto, type BookingDto } from "./shared/booking";
import { generateAvailableSlots } from "./scheduling/availability-engine";

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
export type CreateBookingResult = { booking: BookingDto; replayed: boolean };
export type BookingActor = { id: string; role: "CUSTOMER" | "TECH" };
export type CustomerBookingsDto = {
  upcoming: BookingDto[];
  past: BookingDto[];
  canceled: BookingDto[];
};

const conflictError = () => new AppError("That time is no longer available", 409, "booking_conflict");
const maxTransactionAttempts = 3;

export async function createBooking(
  customerId: string,
  input: CreateBookingInput,
  now = new Date()
): Promise<CreateBookingResult> {
  for (let attempt = 1; attempt <= maxTransactionAttempts; attempt += 1) {
    try {
      return await createBookingTransaction(customerId, input, now);
    } catch (error) {
      let replay;
      try {
        replay = await prisma.booking.findUnique({
          where: { customerId_requestKey: { customerId, requestKey: input.requestKey } },
          include: bookingDisplayInclude
        });
      } catch {
        throw error;
      }
      if (replay) return { booking: toBookingDto(replay, canCustomerCancel(replay, now)), replayed: true };
      if (isSerializableWriteConflict(error) && attempt < maxTransactionAttempts) continue;
      if (isBookingOverlapError(error)) throw conflictError();
      throw error;
    }
  }
  throw new Error("Unreachable booking transaction state");
}

export async function listCustomerBookings(customerId: string, now = new Date()): Promise<CustomerBookingsDto> {
  const bookings = await prisma.booking.findMany({
    where: { customerId },
    include: bookingDisplayInclude
  });
  const upcoming: BookingDto[] = [];
  const past: BookingDto[] = [];
  const canceled: BookingDto[] = [];
  for (const booking of bookings) {
    const dto = toBookingDto(booking, canCustomerCancel(booking, now));
    if (booking.status === "CANCELED") canceled.push(dto);
    else if (booking.startAt.getTime() > now.getTime()) upcoming.push(dto);
    else past.push(dto);
  }
  upcoming.sort(sortStartAscending);
  past.sort(sortStartDescending);
  canceled.sort(sortCanceledDescending);
  return { upcoming, past, canceled };
}

export async function cancelBooking(actor: BookingActor, bookingId: string, now = new Date()): Promise<BookingDto> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingDisplayInclude });
    if (!booking) throw new AppError("Booking not found", 404, "not_found");

    const isCustomer = actor.role === "CUSTOMER" && booking.customerId === actor.id;
    const isTech = actor.role === "TECH" && booking.techProfile.userId === actor.id;
    if (!isCustomer && !isTech) throw new AppError("You cannot cancel this booking", 403, "forbidden");

    if (booking.status === "CANCELED") return toBookingDto(booking, false);
    if (now.getTime() >= booking.startAt.getTime()) {
      throw new AppError("Bookings cannot be canceled after they start", 409, "booking_already_started");
    }
    if (isCustomer && !canCustomerCancel(booking, now)) {
      throw new AppError("The cancellation cutoff has passed", 409, "cancellation_cutoff_passed");
    }

    const canceledAt = now;
    const update = await tx.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED", version: booking.version },
      data: { status: "CANCELED", canceledAt, canceledByUserId: actor.id, version: { increment: 1 } }
    });
    if (update.count === 0) {
      const current = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingDisplayInclude });
      if (current?.status === "CANCELED") return toBookingDto(current, false);
      throw new AppError("Booking could not be canceled", 409, "booking_conflict");
    }

    const payload = cancellationPayload(booking, canceledAt);
    await tx.notificationOutbox.createMany({
      data: [
        {
          bookingId: booking.id,
          eventKey: `${booking.id}:cancellation:customer`,
          messageKind: "BOOKING_CANCELED",
          recipientEmail: booking.customer.email,
          recipientName: booking.customer.fullName,
          payload: { ...payload, recipientRole: "CUSTOMER" }
        },
        {
          bookingId: booking.id,
          eventKey: `${booking.id}:cancellation:tech`,
          messageKind: "BOOKING_CANCELED",
          recipientEmail: booking.techProfile.user.email,
          recipientName: booking.techProfile.displayName || booking.techProfile.businessName,
          payload: { ...payload, recipientRole: "TECH" }
        }
      ]
    });
    const canceled = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingDisplayInclude });
    if (!canceled || canceled.status !== "CANCELED") {
      throw new AppError("Booking could not be canceled", 409, "booking_conflict");
    }
    return toBookingDto(canceled, false);
  });
}

function createBookingTransaction(customerId: string, input: CreateBookingInput, now: Date) {
  return (
    prisma.$transaction(async (tx) => {
      const replay = await tx.booking.findUnique({
        where: { customerId_requestKey: { customerId, requestKey: input.requestKey } },
        include: bookingDisplayInclude
      });
      if (replay) return { booking: toBookingDto(replay, canCustomerCancel(replay, now)), replayed: true };

      const [customer, profile] = await Promise.all([
        tx.user.findUnique({
          where: { id: customerId },
          select: { id: true, email: true, fullName: true }
        }),
        tx.techProfile.findFirst({
          where: { id: input.techProfileId, isPublished: true },
          select: {
            id: true,
            userId: true,
            businessName: true,
            displayName: true,
            user: { select: { email: true } },
            scheduleSettings: {
              select: {
                timeZone: true,
                minimumNoticeMinutes: true,
                maximumAdvanceDays: true,
                bufferMinutes: true,
                cancellationCutoffMinutes: true
              }
            },
            services: {
              where: { id: input.serviceId, isActive: true },
              select: { id: true, name: true, durationMinutes: true, startingPriceCents: true, isActive: true }
            }
          }
        })
      ]);

      if (!customer) throw new AppError("Customer account not found", 404, "not_found");
      if (!profile) throw new AppError("Tech profile not found", 404, "not_found");
      if (profile.userId === customerId) {
        throw new AppError("You cannot book your own tech profile", 409, "self_booking_not_allowed");
      }

      const service = profile.services[0];
      if (!service) throw new AppError("Tech service not found", 404, "not_found");
      if (service.durationMinutes === null || service.startingPriceCents === null) {
        throw new AppError("Tech service is not bookable", 409, "service_not_bookable");
      }
      const settings = profile.scheduleSettings;
      if (!settings) throw new AppError("Tech availability is not configured", 409, "availability_not_configured");

      const requestedStart = new Date(input.startAt);
      const localStart = DateTime.fromJSDate(requestedStart).setZone(settings.timeZone);
      const localDate = localStart.toISODate();
      if (Number.isNaN(requestedStart.getTime()) || !localStart.isValid || !localDate) throw conflictError();

      const endAt = new Date(requestedStart.getTime() + service.durationMinutes * 60_000);
      const blockedUntilAt = new Date(endAt.getTime() + settings.bufferMinutes * 60_000);
      const overrideDate = new Date(`${localDate}T00:00:00.000Z`);
      const [weekly, override, blocked] = await Promise.all([
        tx.weeklyAvailabilityWindow.findMany({
          where: { techProfileId: profile.id, weekday: localStart.weekday % 7 },
          select: { weekday: true, startMinute: true, endMinute: true }
        }),
        tx.availabilityOverride.findUnique({
          where: { techProfileId_localDate: { techProfileId: profile.id, localDate: overrideDate } },
          select: { localDate: true, kind: true, windows: { select: { startMinute: true, endMinute: true } } }
        }),
        tx.booking.findMany({
          where: {
            techProfileId: profile.id,
            status: "CONFIRMED",
            startAt: { lt: blockedUntilAt },
            blockedUntilAt: { gt: requestedStart }
          },
          select: { startAt: true, blockedUntilAt: true }
        })
      ]);

      const selectedStartIsCurrent = generateAvailableSlots({
        month: localStart.toFormat("yyyy-MM"),
        timeZone: settings.timeZone,
        durationMinutes: service.durationMinutes,
        bufferMinutes: settings.bufferMinutes,
        minimumStartAt: new Date(now.getTime() + settings.minimumNoticeMinutes * 60_000),
        maximumStartAt: DateTime.fromJSDate(now).setZone(settings.timeZone).plus({ days: settings.maximumAdvanceDays }).toUTC().toJSDate(),
        weekly,
        overrides: override ? [{
          localDate: override.localDate.toISOString().slice(0, 10),
          unavailable: override.kind === "UNAVAILABLE",
          windows: override.windows
        }] : [],
        blocked
      }).some((slot) => new Date(slot.startAt).getTime() === requestedStart.getTime());
      if (!selectedStartIsCurrent) throw conflictError();

      const bookingId = randomUUID();
      const payload = {
        bookingId,
        customerName: customer.fullName ?? customer.email,
        techName: profile.displayName || profile.businessName,
        serviceName: service.name,
        startAt: requestedStart.toISOString(),
        endAt: endAt.toISOString(),
        timeZone: settings.timeZone,
        durationMinutes: service.durationMinutes,
        startingPriceCents: service.startingPriceCents,
        cancellationCutoffMinutes: settings.cancellationCutoffMinutes
      };
      const booking = await tx.booking.create({
        data: {
          id: bookingId,
          techProfileId: profile.id,
          customerId,
          techServiceId: service.id,
          requestKey: input.requestKey,
          serviceNameSnapshot: service.name,
          durationMinutesSnapshot: service.durationMinutes,
          startingPriceCentsSnapshot: service.startingPriceCents,
          timeZoneSnapshot: settings.timeZone,
          cancellationCutoffMinutesSnapshot: settings.cancellationCutoffMinutes,
          startAt: requestedStart,
          endAt,
          blockedUntilAt,
          notifications: {
            create: [
              {
                eventKey: `${bookingId}:confirmation:customer`,
                messageKind: "BOOKING_CONFIRMED",
                recipientEmail: customer.email,
                recipientName: customer.fullName,
                payload: { ...payload, recipientRole: "CUSTOMER" }
              },
              {
                eventKey: `${bookingId}:confirmation:tech`,
                messageKind: "BOOKING_CONFIRMED",
                recipientEmail: profile.user.email,
                recipientName: profile.displayName || profile.businessName,
                payload: { ...payload, recipientRole: "TECH" }
              }
            ]
          }
        },
        include: bookingDisplayInclude
      });

      return { booking: toBookingDto(booking, canCustomerCancel(booking, now)), replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  );
}

export function isBookingOverlapError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2004" && containsConstraintName(error.meta?.database_error);
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError &&
    /\b23P01\b/.test(error.message) &&
    containsConstraintName(error.message);
}

export async function rescheduleBooking(
  actor: BookingActor,
  bookingId: string,
  input: RescheduleBookingInput,
  now = new Date()
): Promise<CreateBookingResult> {
  for (let attempt = 1; attempt <= maxTransactionAttempts; attempt += 1) {
    try {
      return await rescheduleBookingTransaction(actor, bookingId, input, now);
    } catch (error) {
      // A retry reads the committed history first, so simultaneous identical
      // requests replay without writing a second history or notification pair.
      const duplicateRequest = error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" && error.meta?.modelName === "BookingReschedule";
      if (isSerializableWriteConflict(error) || duplicateRequest) {
        if (attempt < maxTransactionAttempts) {
          await delay(25 * attempt + Math.floor(Math.random() * 25));
          continue;
        }
        throw new AppError("This booking changed. Refresh it before retrying", 409, "booking_version_conflict");
      }
      if (isBookingOverlapError(error)) throw conflictError();
      throw error;
    }
  }
  throw new Error("Unreachable rescheduling transaction state");
}

async function rescheduleBookingTransaction(
  actor: BookingActor,
  bookingId: string,
  input: RescheduleBookingInput,
  now = new Date()
) {
  return (prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingDisplayInclude });
    if (!booking) throw new AppError("Booking not found", 404, "not_found");
    const isCustomer = actor.role === "CUSTOMER" && booking.customerId === actor.id;
    const isTech = actor.role === "TECH" && booking.techProfile.userId === actor.id;
    if (!isCustomer && !isTech) throw new AppError("You cannot reschedule this booking", 403, "forbidden");
    const prevRequest = await tx.bookingReschedule.findUnique({
      where: { bookingId_requestKey: { bookingId, requestKey: input.requestKey } }
    });
    if (prevRequest) {
      const sameRequest = prevRequest.changedByUserId === actor.id &&
        prevRequest.newStartAt.getTime() === new Date(input.startAt).getTime() &&
        prevRequest.reason === (input.reason ?? null);
      if (!sameRequest) throw new AppError("Unable to verify previous request", 409, "request_key_conflict");
      return {
        booking: toBookingDto(booking, canCustomerCancel(booking, now)),
        replayed: true
      }
    }
    const bookingCanceled = booking.status === "CANCELED";
    const bookingStarted = booking.startAt.getTime() <= now.getTime();
    const cutoffAt =
      booking.startAt.getTime()
      - booking.cancellationCutoffMinutesSnapshot * 60_000;

    const cutoffHasPassed = actor.role === "CUSTOMER" && now.getTime() >= cutoffAt;
    const versionMatch = input.version === booking.version;
    if (bookingCanceled) {
      throw new AppError("Canceled bookings cannot be rescheduled", 409, "booking_canceled");
    }
    if (bookingStarted) {
      throw new AppError("Bookings cannot be rescheduled once they start", 409, "booking_already_started");
    }
    if (cutoffHasPassed) {
      throw new AppError("The rescheduling cutoff has passed", 409, "rescheduling_cutoff_passed");
    }
    if (!versionMatch) {
      throw new AppError("This booking has changed. Refresh it before rescheduling", 409, "booking_version_conflict");
    }

    const newStartAt = new Date(input.startAt);
    const newEndAt = new Date(newStartAt.getTime() + booking.durationMinutesSnapshot * 60_000);
    const settings = await tx.techScheduleSettings.findUnique({ where: { techProfileId: booking.techProfileId } });
    if (!settings) throw new AppError("Unable to find availability", 409, "availability_not_configured");
    const buffer = settings.bufferMinutes;
    const newBlockedUntilAt = new Date(newEndAt.getTime() + (buffer * 60_000));

    const localStart = DateTime.fromJSDate(newStartAt).setZone(settings.timeZone);
    const localDate = localStart.toISODate();
    if (
      Number.isNaN(newStartAt.getTime()) ||
      !localStart.isValid ||
      !localDate
    ) {
      throw conflictError();
    }
    const weekly = await tx.weeklyAvailabilityWindow.findMany({
      where: {
        techProfileId: booking.techProfileId,
        weekday: localStart.weekday % 7
      },
      select: {
        weekday: true,
        startMinute: true,
        endMinute: true
      }
    });
    const overrideDate = new Date(`${localDate}T00:00:00.000Z`);
    const override = await tx.availabilityOverride.findUnique({
      where: {
        techProfileId_localDate: {
          techProfileId: booking.techProfileId,
          localDate: overrideDate
        }
      },
      select: {
        localDate: true,
        kind: true,
        windows: {
          select: {
            startMinute: true,
            endMinute: true
          }
        }
      }
    });
    const blocked = await tx.booking.findMany({
      where: {
        techProfileId: booking.techProfileId,
        status: "CONFIRMED",
        id: { not: bookingId },
        startAt: { lt: newBlockedUntilAt },
        blockedUntilAt: { gt: newStartAt }
      },
      select: {
        startAt: true,
        blockedUntilAt: true
      }
    });
    const minimumStartAt = new Date(now.getTime() + (settings.minimumNoticeMinutes * 60_000));
    const maximumStartAt = DateTime.fromJSDate(now)
      .setZone(settings.timeZone)
      .plus({ days: settings.maximumAdvanceDays })
      .toUTC()
      .toJSDate();
    const overrides = override
      ? [{
          localDate: override.localDate.toISOString().slice(0, 10),
          unavailable: override.kind === "UNAVAILABLE",
          windows: override.windows
        }]
      : [];
    const availableSlots = generateAvailableSlots({
      month: localStart.toFormat("yyyy-MM"),
      timeZone: settings.timeZone,
      durationMinutes: booking.durationMinutesSnapshot,
      bufferMinutes: settings.bufferMinutes,
      minimumStartAt,
      maximumStartAt,
      weekly,
      overrides,
      blocked
    });
    const isAvailable = availableSlots.some(
      (slot) => new Date(slot.startAt).getTime() === newStartAt.getTime()
    );
    if (!isAvailable) {
      throw conflictError();
    }
    const updated = await tx.booking.updateMany({
      where: {
        id: bookingId,
        version: input.version,
        status: "CONFIRMED"
      },
      data: {
        startAt: newStartAt,
        endAt: newEndAt,
        blockedUntilAt: newBlockedUntilAt,
        version: { increment: 1 }
      }
    });
    if (updated.count === 0) throw new AppError("Unable to update booking", 409, "booking_version_conflict");
    const reschedule = await tx.bookingReschedule.create({
      data: {
        bookingId: bookingId,
        changedByUserId: actor.id,
        requestKey: input.requestKey,
        oldStartAt: booking.startAt,
        oldEndAt: booking.endAt,
        oldBlockedUntilAt: booking.blockedUntilAt,
        newStartAt: newStartAt,
        newEndAt: newEndAt,
        newBlockedUntilAt: newBlockedUntilAt,
        reason: input.reason ?? null
      }
    });
    const rescheduledBooking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: bookingDisplayInclude
    });
    if (!rescheduledBooking) throw new AppError("Booking not rescheduled", 409, "booking_not_rescheduled");

    const payload = {
      bookingId: rescheduledBooking.id,
      customerName: rescheduledBooking.customer.fullName ?? rescheduledBooking.customer.email,
      techName: rescheduledBooking.techProfile.displayName || rescheduledBooking.techProfile.businessName,
      serviceName: rescheduledBooking.serviceNameSnapshot,
      startAt: rescheduledBooking.startAt.toISOString(),
      endAt: rescheduledBooking.endAt.toISOString(),
      oldStartAt: reschedule.oldStartAt.toISOString(),
      oldEndAt: reschedule.oldEndAt.toISOString(),
      timeZone: rescheduledBooking.timeZoneSnapshot,
      durationMinutes: rescheduledBooking.durationMinutesSnapshot,
      startingPriceCents: rescheduledBooking.startingPriceCentsSnapshot,
      cancellationCutoffMinutes: rescheduledBooking.cancellationCutoffMinutesSnapshot
    };

    await tx.notificationOutbox.createMany({
      data: [
        {
          bookingId, eventKey: `${reschedule.id}:rescheduled:customer`, messageKind: "BOOKING_RESCHEDULED",
          recipientEmail: rescheduledBooking.customer.email,
          recipientName: rescheduledBooking.customer.fullName,
          payload: { ...payload, recipientRole: "CUSTOMER" }
        },
        {
          bookingId, eventKey: `${reschedule.id}:rescheduled:tech`, messageKind: "BOOKING_RESCHEDULED",
          recipientEmail: rescheduledBooking.techProfile.user.email,
          recipientName: rescheduledBooking.techProfile.displayName || rescheduledBooking.techProfile.businessName,
          payload: { ...payload, recipientRole: "TECH" }
        }
      ]
    });
    return {
      booking: toBookingDto(
        rescheduledBooking,
        canCustomerCancel(rescheduledBooking, now)
      ),
      replayed: false
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

function isSerializableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function containsConstraintName(value: unknown): boolean {
  if (typeof value === "string") {
    return /(^|[^A-Za-z0-9_])Booking_no_confirmed_overlap($|[^A-Za-z0-9_])/.test(value);
  }
  if (Array.isArray(value)) return value.some(containsConstraintName);
  if (isRecord(value)) return Object.values(value).some(containsConstraintName);
  return false;
}

function canCustomerCancel(
  booking: { status: string; startAt: Date; cancellationCutoffMinutesSnapshot: number },
  now: Date
) {
  return booking.status === "CONFIRMED" &&
    now.getTime() < booking.startAt.getTime() - booking.cancellationCutoffMinutesSnapshot * 60_000;
}

function sortStartAscending(left: BookingDto, right: BookingDto) {
  return new Date(left.startAt).getTime() - new Date(right.startAt).getTime();
}

function sortStartDescending(left: BookingDto, right: BookingDto) {
  return new Date(right.startAt).getTime() - new Date(left.startAt).getTime();
}

function sortCanceledDescending(left: BookingDto, right: BookingDto) {
  return new Date(right.canceledAt ?? right.updatedAt).getTime() - new Date(left.canceledAt ?? left.updatedAt).getTime();
}

function cancellationPayload(booking: import("./shared/booking").BookingWithDisplay, canceledAt: Date) {
  return {
    bookingId: booking.id,
    customerName: booking.customer.fullName ?? booking.customer.email,
    techName: booking.techProfile.displayName || booking.techProfile.businessName,
    serviceName: booking.serviceNameSnapshot,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    timeZone: booking.timeZoneSnapshot,
    durationMinutes: booking.durationMinutesSnapshot,
    startingPriceCents: booking.startingPriceCentsSnapshot,
    cancellationCutoffMinutes: booking.cancellationCutoffMinutesSnapshot,
    canceledAt: canceledAt.toISOString()
  };
}
