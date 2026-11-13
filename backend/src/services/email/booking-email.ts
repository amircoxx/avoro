/** Renders deterministic, snapshot-based booking emails without private profile details. */
import { DateTime } from "luxon";

export type BookingEmailKind = "BOOKING_CONFIRMED" | "BOOKING_CANCELED" | "BOOKING_RESCHEDULED";
export type BookingEmailPayload = {
  bookingId: string;
  customerName: string;
  techName: string;
  serviceName: string;
  startAt: string;
  oldStartAt?: string;
  endAt: string;
  timeZone: string;
  durationMinutes: number;
  startingPriceCents: number;
  cancellationCutoffMinutes: number;
  recipientRole: "CUSTOMER" | "TECH";
  appPublicUrl: string;
  canceledAt?: string;
};

export type RenderedBookingEmail = {
  subject: string;
  htmlContent: string;
  textContent: string;
};

export function renderBookingEmail(kind: BookingEmailKind, payload: BookingEmailPayload): RenderedBookingEmail {
  const localStart = DateTime.fromISO(payload.startAt, { setZone: true })
    .setZone(payload.timeZone)
    .setLocale("en-US");
  if (!localStart.isValid) throw new Error("Invalid booking email date");

  const isTech = payload.recipientRole === "TECH";
  const isCanceled = kind === "BOOKING_CANCELED";
  const isRescheduled = kind === "BOOKING_RESCHEDULED";
  const subjectPrefix = isCanceled ? "Booking canceled" : isRescheduled ? "Booking rescheduled" : isTech ? "New booking" : "Booking confirmed";
  const heading = isCanceled ? "Booking canceled" : isRescheduled ? "Booking rescheduled" : isTech ? "You have a new booking" : "Your booking is confirmed";
  const accountUrl = `${payload.appPublicUrl.replace(/\/$/, "")}/${isTech ? "schedule" : "bookings"}`;
  const localDateTime = `${localStart.toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ")} (${payload.timeZone})`;
  const duration = formatMinutes(payload.durationMinutes);
  const cutoff = `${formatMinutes(payload.cancellationCutoffMinutes)} before the appointment`;
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(payload.startingPriceCents / 100);
  const intro = isCanceled
    ? `The ${payload.serviceName} booking between ${payload.customerName} and ${payload.techName} has been canceled.`
    : isRescheduled
      ? `The ${payload.serviceName} booking between ${payload.customerName} and ${payload.techName} has been rescheduled.`
      : isTech
        ? `${payload.customerName} booked ${payload.serviceName}.`
        : `${payload.techName} will provide ${payload.serviceName}.`;
  let previousDateTime = "";

  if (isRescheduled) {
    if (!payload.oldStartAt) {
      throw new Error("Missing previous booking start time");
    }

    const previousStart = DateTime.fromISO(payload.oldStartAt, {
      setZone: true
    }).setZone(payload.timeZone).setLocale("en-US");

    if (!previousStart.isValid) {
      throw new Error("Invalid previous booking start time");
    }

    previousDateTime =
      `${previousStart.toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ")} (${payload.timeZone})`;
  }

  const details = [
    `Customer: ${payload.customerName}`,
    `Tech: ${payload.techName}`,
    ...(isRescheduled ? [`Previous date and time: ${previousDateTime}`] : []),
    `Date and time: ${localDateTime}`,
    `Service: ${payload.serviceName}`,
    `Duration: ${duration}`,
    `Starting price: ${price}`,
    `Cancellation cutoff: ${cutoff}`,
    `Booking ID: ${payload.bookingId}`,
    `View your booking: ${accountUrl}`
  ];
  const textContent = [heading, "", intro, "", ...details].join("\n");
  const htmlDetails = details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");
  const htmlContent = [
    `<h1>${escapeHtml(heading)}</h1>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<ul>${htmlDetails}</ul>`,
    `<p><a href="${escapeHtml(accountUrl)}">View your booking</a></p>`
  ].join("");

  return { subject: `${subjectPrefix}: ${payload.serviceName}`, htmlContent, textContent };
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`);
  return parts.join(" ") || "0 minutes";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
