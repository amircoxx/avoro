/** Maps durable booking snapshots to the stable API representation shared by booking flows. */
import type { Booking, Prisma } from "@prisma/client";

export const bookingDisplayInclude = {
  techProfile: {
    select: {
      id: true,
      userId: true,
      businessName: true,
      displayName: true,
      user: { select: { email: true } }
    }
  },
  customer: {
    select: { id: true, fullName: true, email: true }
  }
} satisfies Prisma.BookingInclude;

export type BookingWithDisplay = Booking & {
  techProfile: {
    id: string;
    userId: string;
    businessName: string;
    displayName: string;
    user: { email: string };
  };
  customer: { id: string; fullName: string | null; email: string };
};

export type BookingDto = {
  id: string;
  techProfileId: string;
  customerId: string;
  serviceId: string;
  requestKey: string;
  serviceName: string;
  durationMinutes: number;
  startingPriceCents: number;
  timeZone: string;
  cancellationCutoffMinutes: number;
  startAt: string;
  endAt: string;
  blockedUntilAt: string;
  status: "CONFIRMED" | "CANCELED";
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  tech: { id: string; businessName: string; displayName: string };
  customer: { id: string; displayName: string };
  canCancel: boolean;
  version: number;
};

export type TechCalendarBookingDto = BookingDto & {
  customer: { id: string; displayName: string; email: string };
  currentTimeZone?: string;
};

export function toBookingDto(booking: BookingWithDisplay, canCancel: boolean): BookingDto {
  return {
    id: booking.id,
    techProfileId: booking.techProfileId,
    customerId: booking.customerId,
    serviceId: booking.techServiceId,
    requestKey: booking.requestKey,
    serviceName: booking.serviceNameSnapshot,
    durationMinutes: booking.durationMinutesSnapshot,
    startingPriceCents: booking.startingPriceCentsSnapshot,
    timeZone: booking.timeZoneSnapshot,
    cancellationCutoffMinutes: booking.cancellationCutoffMinutesSnapshot,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    blockedUntilAt: booking.blockedUntilAt.toISOString(),
    status: booking.status,
    canceledAt: booking.canceledAt?.toISOString() ?? null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    version: booking.version,
    tech: {
      id: booking.techProfile.id,
      businessName: booking.techProfile.businessName,
      displayName: booking.techProfile.displayName
    },
    customer: {
      id: booking.customer.id,
      displayName: booking.customer.fullName ?? booking.customer.email
    },
    canCancel
  };
}

export function toTechCalendarBookingDto(
  booking: BookingWithDisplay,
  canCancel: boolean,
  currentTimeZone?: string
): TechCalendarBookingDto {
  const base = toBookingDto(booking, canCancel);
  return {
    ...base,
    customer: {
      ...base.customer,
      email: booking.customer.email
    },
    ...(currentTimeZone && currentTimeZone !== booking.timeZoneSnapshot ? { currentTimeZone } : {})
  };
}
