import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  cancelBooking,
  createBooking,
  getCustomerBookings,
  getMonthAvailability,
  getRescheduleAvailability,
  rescheduleBooking
} from "../api";

const booking = {
  id: "booking-1",
  techProfileId: "tech-1",
  customerId: "customer-1",
  serviceId: "service-1",
  requestKey: "request-1",
  serviceName: "Gel-X Full Set",
  durationMinutes: 90,
  startingPriceCents: 8500,
  timeZone: "America/New_York",
  cancellationCutoffMinutes: 120,
  startAt: "2026-08-03T14:00:00.000Z",
  endAt: "2026-08-03T15:30:00.000Z",
  blockedUntilAt: "2026-08-03T15:45:00.000Z",
  status: "CONFIRMED" as const,
  canceledAt: null,
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
  tech: { id: "tech-1", businessName: "Gloss Room", displayName: "Mia" },
  customer: { id: "customer-1", displayName: "Avery" },
  canCancel: true
};

describe("booking API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads an encoded tech service month with the public availability response", async () => {
    const data = {
      month: "2026-08",
      timeZone: "America/New_York",
      service: { id: "service / 1", name: "Gel-X", durationMinutes: 90, startingPriceCents: 8500 },
      slots: [{ startAt: "2026-08-03T14:00:00.000Z", localDate: "2026-08-03", localTime: "10:00 AM", timeZone: "America/New_York" }]
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMonthAvailability("tech / 1", "service / 1", "2026-08")).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/techs/tech%20%2F%201/availability?serviceId=service+%2F+1&month=2026-08"
    );
  });

  it("creates a booking with credentials and returns its booking envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { booking } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      techProfileId: "tech-1",
      serviceId: "service-1",
      startAt: "2026-08-03T14:00:00.000Z",
      requestKey: "request-1"
    };

    await expect(createBooking(input)).resolves.toEqual(booking);
    expect(fetchMock).toHaveBeenCalledWith("/api/bookings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  });

  it("returns the customer booking groups and cancels encoded booking ids with credentials", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { upcoming: [booking], past: [], canceled: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { booking: { ...booking, status: "CANCELED" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCustomerBookings()).resolves.toEqual({ upcoming: [booking], past: [], canceled: [] });
    await expect(cancelBooking("booking / 1")).resolves.toMatchObject({ id: "booking-1", status: "CANCELED" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/bookings", { credentials: "include" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/bookings/booking%20%2F%201/cancel", {
      method: "POST",
      credentials: "include"
    });
  });

  it("reschedules with an encoded ID, credentials and JSON, returning the updated booking", async () => {
    const updated = { ...booking, version: 1, startAt: "2026-08-04T14:00:00.000Z" };
    const input = { startAt: updated.startAt, version: 0, requestKey: "move-1", reason: "New plans" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { booking: updated } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(rescheduleBooking("booking / 1", input)).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/bookings/booking%20%2F%201/reschedule", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  });

  it("loads booking-specific availability with credentials and preserves its version", async () => {
    const data = { bookingId: "booking / 1", month: "2026-08", version: 2, slots: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getRescheduleAvailability("booking / 1", "2026-08")).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/bookings/booking%20%2F%201/reschedule-availability?month=2026-08", { credentials: "include" }
    );
  });

  it("preserves the stale-version error for the rescheduling UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "booking_version_conflict", message: "Refresh this booking" }
    }), { status: 409 })));

    await expect(rescheduleBooking("booking-1", {
      startAt: "2026-08-04T14:00:00.000Z", version: 0, requestKey: "move-1"
    })).rejects.toMatchObject({ status: 409, code: "booking_version_conflict", message: "Refresh this booking" });
  });

  it("preserves booking conflict details for a booking flow to handle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "booking_conflict", message: "That time was just booked" }
    }), { status: 409 })));

    await expect(createBooking({ techProfileId: "tech-1", serviceId: "service-1", startAt: "2026-08-03T14:00:00.000Z", requestKey: "request-1" }))
      .rejects.toMatchObject({
        name: "ApiClientError",
        status: 409,
        code: "booking_conflict",
        message: "That time was just booked"
      } satisfies Partial<ApiClientError>);
  });
});
