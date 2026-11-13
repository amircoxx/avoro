import { describe, expect, it } from "vitest";
import { renderBookingEmail, type BookingEmailPayload } from "../email/booking-email";

const basePayload: BookingEmailPayload = {
  bookingId: "booking-123",
  customerName: "Jordan <script>alert('x')</script>",
  techName: "Maya & Co.",
  serviceName: "Gel-X <Full Set>",
  startAt: "2026-11-01T15:30:00.000Z",
  endAt: "2026-11-01T17:00:00.000Z",
  timeZone: "America/New_York",
  durationMinutes: 90,
  startingPriceCents: 8500,
  cancellationCutoffMinutes: 1440,
  recipientRole: "CUSTOMER",
  appPublicUrl: "https://findmytech.example"
};

describe("booking email templates", () => {
  it.each([
    ["BOOKING_CONFIRMED", "CUSTOMER", "Booking confirmed", "https://findmytech.example/bookings"],
    ["BOOKING_CONFIRMED", "TECH", "New booking", "https://findmytech.example/schedule"],
    ["BOOKING_CANCELED", "CUSTOMER", "Booking canceled", "https://findmytech.example/bookings"],
    ["BOOKING_CANCELED", "TECH", "Booking canceled", "https://findmytech.example/schedule"]
  ] as const)("renders deterministic %s content for %s", (kind, recipientRole, subjectPrefix, accountUrl) => {
    const result = renderBookingEmail(kind, { ...basePayload, recipientRole });

    expect(result.subject).toBe(`${subjectPrefix}: Gel-X <Full Set>`);
    expect(result.textContent).toContain("Sunday, November 1, 2026 at 10:30 AM EST (America/New_York)");
    expect(result.textContent).toContain("Service: Gel-X <Full Set>");
    expect(result.textContent).toContain("Duration: 1 hour 30 minutes");
    expect(result.textContent).toContain("Starting price: $85.00");
    expect(result.textContent).toContain("Cancellation cutoff: 24 hours before the appointment");
    expect(result.textContent).toContain("Booking ID: booking-123");
    expect(result.textContent).toContain(`View your booking: ${accountUrl}`);
    expect(result.htmlContent).toContain("Jordan &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(result.htmlContent).toContain("Maya &amp; Co.");
    expect(result.htmlContent).toContain("Gel-X &lt;Full Set&gt;");
    expect(result.htmlContent).not.toContain("<script>");
    expect(JSON.stringify(result)).not.toContain("serviceAddress");
    expect(JSON.stringify(result)).not.toContain("123 Private Lane");

    expect(renderBookingEmail(kind, { ...basePayload, recipientRole })).toEqual(result);
  });

  it("uses the snapshotted timezone around daylight-saving changes", () => {
    const result = renderBookingEmail("BOOKING_CONFIRMED", basePayload);
    expect(result.textContent).toContain("10:30 AM EST (America/New_York)");
    expect(result.textContent).not.toContain("15:30");
  });

  it.each(["CUSTOMER", "TECH"] as const)("uses actor-neutral cancellation wording for %s", (recipientRole) => {
    const result = renderBookingEmail("BOOKING_CANCELED", { ...basePayload, recipientRole });

    expect(result.textContent).toContain(
      "The Gel-X <Full Set> booking between Jordan <script>alert('x')</script> and Maya & Co. has been canceled."
    );
    expect(result.textContent).not.toContain("Jordan <script>alert('x')</script> canceled");
    expect(result.textContent).not.toContain("Maya & Co. will no longer provide");
  });

  it("does not render unknown private payload fields", () => {
    const result = renderBookingEmail("BOOKING_CONFIRMED", {
      ...basePayload,
      serviceAddress: "123 Private Lane"
    } as BookingEmailPayload & { serviceAddress: string });
    expect(result.htmlContent).not.toContain("123 Private Lane");
    expect(result.textContent).not.toContain("123 Private Lane");
  });

  it.each(["CUSTOMER", "TECH"] as const)("renders rescheduled content for %s", (recipientRole) => {
    const result = renderBookingEmail("BOOKING_RESCHEDULED", {
      ...basePayload,
      recipientRole,
      oldStartAt: "2026-10-01T10:30:00-04:00"
    });

    expect(result.subject).toBe("Booking rescheduled: Gel-X <Full Set>");
    for (const content of [result.textContent, result.htmlContent]) {
      expect(content).toContain("Previous date and time: Thursday, October 1, 2026 at 10:30 AM EDT (America/New_York)");
      expect(content).toContain("Date and time: Sunday, November 1, 2026 at 10:30 AM EST (America/New_York)");
    }
  });

  it.each(["CUSTOMER", "TECH"] as const)("throws if oldStartAt is missing for rescheduled booking for %s", (recipientRole) => {
    expect(() => renderBookingEmail("BOOKING_RESCHEDULED", { ...basePayload, recipientRole }))
      .toThrow("Missing previous booking start time");
  });

  it.each(["CUSTOMER", "TECH"] as const)("throws if oldStartAt is invalid for rescheduled booking for %s", (recipientRole) => {
    expect(() => renderBookingEmail("BOOKING_RESCHEDULED", {
      ...basePayload,
      recipientRole,
      oldStartAt: "not-a-date"
    })).toThrow("Invalid previous booking start time");
  });

  it.each([
    ["BOOKING_CONFIRMED", "CUSTOMER"],
    ["BOOKING_CONFIRMED", "TECH"],
    ["BOOKING_CANCELED", "CUSTOMER"],
    ["BOOKING_CANCELED", "TECH"]
  ] as const)("omits the previous start time for %s emails to %s", (kind, recipientRole) => {
    const result = renderBookingEmail(kind, {
      ...basePayload,
      recipientRole,
      oldStartAt: "2026-10-01T10:30:00-04:00"
    });

    expect(result.textContent).not.toContain("Previous date and time:");
    expect(result.htmlContent).not.toContain("Previous date and time:");
  });
});
