/** Maps customer booking endpoints. */
import { Router } from "express";
import { cancelOwnBooking, createCustomerBooking, getCustomerBookings, rescheduleOwnBooking, getOwnRescheduleAvailability } from "../controllers/booking.controller";

export const bookingRouter = Router();
bookingRouter.post("/", createCustomerBooking);
bookingRouter.get("/", getCustomerBookings);
bookingRouter.post("/:bookingId/cancel", cancelOwnBooking);
bookingRouter.post("/:bookingId/reschedule", rescheduleOwnBooking);
bookingRouter.get("/:bookingId/reschedule-availability", getOwnRescheduleAvailability);
