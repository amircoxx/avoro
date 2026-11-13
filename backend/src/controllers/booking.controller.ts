/** HTTP adapters for customer booking resources. */
import type { NextFunction, Request, Response } from "express";
import { getRescheduleAvailability } from "../services/availability.service";
import { cancelBooking, createBooking, listCustomerBookings, rescheduleBooking } from "../services/booking.service";
import { requireCurrentUser, requireRole } from "../services/session.service";
import { AppError } from "../utils/errors";
import { bookingIdParamSchema, createBookingSchema, rescheduleBookingSchema, rescheduleAvailabilityQuerySchema } from "../validations/booking.schema";

export async function createCustomerBooking(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    const result = await createBooking(user.id, createBookingSchema.parse(request.body));
    response.status(result.replayed ? 200 : 201).json({ data: { booking: result.booking } });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerBookings(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER"]);
    response.json({ data: await listCustomerBookings(user.id) });
  } catch (error) {
    next(error);
  }
}

export async function cancelOwnBooking(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireCurrentUser(request.headers.cookie);
    const bookingId = bookingIdParamSchema.parse(request.params.bookingId);
    if (user.role !== "CUSTOMER" && user.role !== "TECH") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }
    const booking = await cancelBooking({ id: user.id, role: user.role }, bookingId);
    response.json({ data: { booking } });
  } catch (error) {
    next(error);
  }
}

export async function rescheduleOwnBooking(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireCurrentUser(request.headers.cookie);
    const bookingId = bookingIdParamSchema.parse(request.params.bookingId);
    if (user.role !== "CUSTOMER" && user.role !== "TECH") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }
    const { booking } = await rescheduleBooking({ id: user.id, role: user.role }, bookingId, rescheduleBookingSchema.parse(request.body));
    response.status(200).json({ data: { booking } });
  } catch (error) {
    next(error);
  }
}

export async function getOwnRescheduleAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await requireRole(request.headers.cookie, ["CUSTOMER", "TECH"]);
    const bookingId = bookingIdParamSchema.parse(request.params.bookingId);
    const { month } = rescheduleAvailabilityQuerySchema.parse(request.query);
    if (user.role !== "CUSTOMER" && user.role !== "TECH") {
      throw new AppError("Insufficient permissions", 403, "forbidden");
    }
    const data = await getRescheduleAvailability({ id: user.id, role: user.role }, bookingId, month);
    response.json({ data });
  } catch (error) {
    next(error);
  }
}
