import request from "supertest";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/errors";

const session = vi.hoisted(() => ({ requireRole: vi.fn(), requireCurrentUser: vi.fn() }));
const bookings = vi.hoisted(() => ({
  createBooking: vi.fn(),
  listCustomerBookings: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  isBookingOverlapError: vi.fn(() => false)
}));
const schedules = vi.hoisted(() => ({
  getOwnSchedule: vi.fn(),
  replaceOwnWeeklyAvailability: vi.fn(),
  saveOwnScheduleSettings: vi.fn(),
  upsertOwnOverride: vi.fn(),
  deleteOwnOverride: vi.fn(),
  listOwnCalendarBookings: vi.fn()
}));
const availability = vi.hoisted(() => ({ getPublicAvailability: vi.fn(), getRescheduleAvailability: vi.fn() }));

vi.mock("../services/session.service", () => session);
vi.mock("../services/booking.service", () => bookings);
vi.mock("../services/schedule.service", () => schedules);
vi.mock("../services/availability.service", () => availability);

import { app } from "../app";

const body = {
  techProfileId: "12dcb560-d78f-4c0f-a228-581b871d8db6",
  serviceId: "3754164f-7c66-4c13-ad80-f810453c07f5",
  startAt: "2026-07-21T13:00:00.000Z",
  requestKey: "b11e428e-58c5-4acc-ae40-74ec00fe39d8"
};
const customer = {
  id: "be01c6b7-77dc-4599-b7ad-40c09ce890f8",
  email: "jordan@example.com",
  role: "CUSTOMER",
  fullName: "Jordan",
  avatarUrl: null
};
const booking = { id: "84cf2c36-8c3e-4e1f-899b-5f400c6c115e" };

describe("POST /api/bookings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    session.requireRole.mockRejectedValue(new AppError("Authentication required", 401, "unauthorized"));

    const response = await request(app).post("/api/bookings").send(body);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "unauthorized", message: "Authentication required" } });
    expect(bookings.createBooking).not.toHaveBeenCalled();
  });

  it("forbids tech accounts", async () => {
    session.requireRole.mockRejectedValue(new AppError("Insufficient permissions", 403, "forbidden"));

    const response = await request(app).post("/api/bookings").send(body);

    expect(response.status).toBe(403);
    expect(session.requireRole).toHaveBeenCalledWith(undefined, ["CUSTOMER"]);
  });

  it("returns 422 for invalid or client-owned booking calculations", async () => {
    session.requireRole.mockResolvedValue(customer);

    const invalid = await request(app).post("/api/bookings").send({ ...body, durationMinutes: 5 });

    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ error: { code: "validation_error" } });
    expect(bookings.createBooking).not.toHaveBeenCalled();
  });

  it("returns 201 for a newly created booking", async () => {
    session.requireRole.mockResolvedValue(customer);
    bookings.createBooking.mockResolvedValue({ replayed: false, booking });

    const response = await request(app).post("/api/bookings").send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { booking } });
    expect(bookings.createBooking).toHaveBeenCalledWith(customer.id, body);
  });

  it("returns 200 with the same booking for an idempotent replay", async () => {
    session.requireRole.mockResolvedValue(customer);
    bookings.createBooking.mockResolvedValue({ replayed: true, booking });

    const response = await request(app).post("/api/bookings").send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { booking } });
  });

  it("returns the stable overlap conflict", async () => {
    session.requireRole.mockResolvedValue(customer);
    bookings.createBooking.mockRejectedValue(new AppError("That time is no longer available", 409, "booking_conflict"));

    const response = await request(app).post("/api/bookings").send(body);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: "booking_conflict", message: "That time is no longer available" }
    });
  });

  it("does not mislabel a booking request-key uniqueness failure as an email conflict", async () => {
    session.requireRole.mockResolvedValue(customer);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bookings.createBooking.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { modelName: "Booking", target: ["customerId", "requestKey"] }
    }));

    const response = await request(app).post("/api/bookings").send(body);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
    consoleError.mockRestore();
  });
});

describe("booking lifecycle endpoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the current customer's grouped booking history", async () => {
    session.requireRole.mockResolvedValue(customer);
    bookings.listCustomerBookings.mockResolvedValue({ upcoming: [booking], past: [], canceled: [] });

    const response = await request(app).get("/api/bookings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { upcoming: [booking], past: [], canceled: [] } });
    expect(bookings.listCustomerBookings).toHaveBeenCalledWith(customer.id);
  });

  it("cancels through the authenticated owning customer or tech service", async () => {
    session.requireCurrentUser.mockResolvedValue(customer);
    bookings.cancelBooking.mockResolvedValue({ ...booking, status: "CANCELED" });

    const response = await request(app).post(`/api/bookings/${booking.id}/cancel`).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { booking: { ...booking, status: "CANCELED" } } });
    expect(bookings.cancelBooking).toHaveBeenCalledWith({ id: customer.id, role: "CUSTOMER" }, booking.id);
  });

  it("returns the stable customer-cutoff conflict", async () => {
    session.requireCurrentUser.mockResolvedValue(customer);
    bookings.cancelBooking.mockRejectedValue(new AppError("The cancellation cutoff has passed", 409, "cancellation_cutoff_passed"));

    const response = await request(app).post(`/api/bookings/${booking.id}/cancel`).send({});

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: "cancellation_cutoff_passed", message: "The cancellation cutoff has passed" }
    });
  });

  it("allows an authenticated tech calendar only with offset-aware range datetimes", async () => {
    const tech = { ...customer, id: "93350160-c359-4707-a490-84ea6d679818", role: "TECH" };
    const range = { from: "2026-07-20T00:00:00.000-04:00", to: "2026-07-27T00:00:00.000-04:00" };
    session.requireRole.mockResolvedValue(tech);
    schedules.listOwnCalendarBookings.mockResolvedValue([{ ...booking, customer: { displayName: "Jordan", email: customer.email } }]);

    const response = await request(app).get(
      `/api/schedule/bookings?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ ...booking, customer: { displayName: "Jordan", email: customer.email } }] });
    expect(schedules.listOwnCalendarBookings).toHaveBeenCalledWith(tech.id, range);
  });

  it("accepts an exact 93-day tech calendar range", async () => {
    const tech = { ...customer, role: "TECH" };
    const range = { from: "2026-07-01T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" };
    session.requireRole.mockResolvedValue(tech);
    schedules.listOwnCalendarBookings.mockResolvedValue([]);

    const response = await request(app).get(
      `/api/schedule/bookings?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(schedules.listOwnCalendarBookings).toHaveBeenCalledWith(tech.id, range);
  });

  it.each([
    ["an inverted range", "2026-07-02T00:00:00.000Z", "2026-07-01T00:00:00.000Z"],
    ["an offset-aware invalid calendar date", "2026-02-30T00:00:00.000Z", "2026-03-02T01:00:00.000Z"]
  ])("rejects %s in the controller", async (_label, from, to) => {
    session.requireRole.mockResolvedValue({ ...customer, role: "TECH" });

    const response = await request(app).get(
      `/api/schedule/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );

    expect(response.status).toBe(422);
    expect(schedules.listOwnCalendarBookings).not.toHaveBeenCalled();
  });

  it("rejects a tech calendar range without a timezone offset", async () => {
    session.requireRole.mockResolvedValue({ ...customer, role: "TECH" });

    const response = await request(app).get(
      `/api/schedule/bookings?from=${encodeURIComponent("2026-07-20T00:00:00")}&to=${encodeURIComponent("2026-07-27T00:00:00.000Z")}`
    );

    expect(response.status).toBe(422);
    expect(schedules.listOwnCalendarBookings).not.toHaveBeenCalled();
  });
});

describe("GET /api/techs/:techId/availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the technician timezone and current cancellation cutoff as public booking policy", async () => {
    availability.getPublicAvailability.mockResolvedValue({
      month: "2026-07",
      timeZone: "America/New_York",
      cancellationCutoffMinutes: 1440,
      service: { id: body.serviceId, name: "Structured manicure", durationMinutes: 90, startingPriceCents: 9500 },
      slots: []
    });

    const response = await request(app).get(`/api/techs/${body.techProfileId}/availability?serviceId=${body.serviceId}&month=2026-07`);

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown }).data).toMatchObject({ timeZone: "America/New_York", cancellationCutoffMinutes: 1440 });
  });
});


describe("POST /api/bookings/:bookingId/reschedule", () => {
  const input = { startAt: body.startAt, requestKey: body.requestKey, version: 0, reason: "New plans" };
  const endpoint = `/api/bookings/${booking.id}/reschedule`;

  beforeEach(() => {
    vi.clearAllMocks();
    session.requireCurrentUser.mockResolvedValue(customer);
    bookings.rescheduleBooking.mockResolvedValue({ booking: { ...booking, version: 1 }, replayed: false });
  });

  it.each([
    ["CUSTOMER", false], ["CUSTOMER", true], ["TECH", false], ["TECH", true]
  ] as const)("returns the booking directly for %s with replayed=%s", async (role, replayed) => {
    session.requireCurrentUser.mockResolvedValue({ ...customer, role });
    const updated = { ...booking, version: 1, startAt: input.startAt };
    bookings.rescheduleBooking.mockResolvedValue({ booking: updated, replayed });
    const response = await request(app).post(endpoint).send(input);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { booking: updated } });
    expect(session.requireCurrentUser).toHaveBeenCalledWith(undefined);
    expect(bookings.rescheduleBooking).toHaveBeenCalledExactlyOnceWith(
      { id: customer.id, role }, booking.id, input
    );
  });

  it("requires authentication before calling the service", async () => {
    session.requireCurrentUser.mockRejectedValue(new AppError("Authentication required", 401, "unauthorized"));
    const response = await request(app).post(endpoint).send(input);
    expect(response.status).toBe(401);
    expect(bookings.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("rejects unsupported account roles", async () => {
    session.requireCurrentUser.mockResolvedValue({ ...customer, role: "ADMIN" });
    const response = await request(app).post(endpoint).send(input);
    expect(response.status).toBe(403);
    expect(bookings.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("validates the booking ID", async () => {
    const response = await request(app).post("/api/bookings/not-a-uuid/reschedule").send(input);
    expect(response.status).toBe(422);
    expect(bookings.rescheduleBooking).not.toHaveBeenCalled();
  });

  it.each([
    { version: -1 }, { version: undefined }, { requestKey: "bad-key" },
    { startAt: "not-a-date" }, { customerId: customer.id }
  ])("rejects invalid body fields %j", async (fields) => {
    const response = await request(app).post(endpoint).send({ ...input, ...fields });
    expect(response.status).toBe(422);
    expect(bookings.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("passes the parsed and trimmed reason to the service", async () => {
    await request(app).post(endpoint).send({ ...input, reason: "  New plans  " });
    expect(bookings.rescheduleBooking).toHaveBeenCalledWith(
      { id: customer.id, role: "CUSTOMER" }, booking.id, input
    );
  });

  it.each([
    [403, "forbidden"], [404, "not_found"], [409, "booking_version_conflict"],
    [409, "booking_conflict"], [409, "request_key_conflict"], [409, "rescheduling_cutoff_passed"]
  ])("forwards service error %s/%s", async (status, code) => {
    bookings.rescheduleBooking.mockRejectedValue(new AppError("Reschedule rejected", status, code));
    const response = await request(app).post(endpoint).send(input);
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: { code, message: "Reschedule rejected" } });
  });
});


describe("GET /api/bookings/:bookingId/reschedule-availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.requireRole.mockResolvedValue(customer);
  });

  it.each(["CUSTOMER", "TECH"])("returns authenticated availability for %s", async (role) => {
    session.requireRole.mockResolvedValue({ ...customer, role });
    const data = { bookingId: booking.id, version: 1, month: "2026-07", slots: [] };
    availability.getRescheduleAvailability.mockResolvedValue(data);
    const response = await request(app).get(`/api/bookings/${booking.id}/reschedule-availability?month=2026-07`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data });
    expect(session.requireRole).toHaveBeenCalledWith(undefined, ["CUSTOMER", "TECH"]);
    expect(availability.getRescheduleAvailability).toHaveBeenCalledWith({ id: customer.id, role }, booking.id, "2026-07");
  });

  it.each(["", "?month=2026-13", "?month=2026-07&serviceId=other"])("rejects invalid queries %s", async (query) => {
    const response = await request(app).get(`/api/bookings/${booking.id}/reschedule-availability${query}`);
    expect(response.status).toBe(422);
    expect(availability.getRescheduleAvailability).not.toHaveBeenCalled();
  });

  it("rejects malformed booking IDs", async () => {
    const response = await request(app).get("/api/bookings/invalid/reschedule-availability?month=2026-07");
    expect(response.status).toBe(422);
    expect(availability.getRescheduleAvailability).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    session.requireRole.mockRejectedValue(new AppError("Authentication required", 401, "unauthorized"));
    const response = await request(app).get(`/api/bookings/${booking.id}/reschedule-availability?month=2026-07`);
    expect(response.status).toBe(401);
    expect(availability.getRescheduleAvailability).not.toHaveBeenCalled();
  });

  it("preserves the service ownership error", async () => {
    availability.getRescheduleAvailability.mockRejectedValue(new AppError("Forbidden", 403, "forbidden"));
    const response = await request(app).get(`/api/bookings/${booking.id}/reschedule-availability?month=2026-07`);
    expect(response.status).toBe(403);
  });
});
