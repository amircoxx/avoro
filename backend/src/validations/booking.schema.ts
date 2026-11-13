/** Validates public booking availability query values before they reach services. */
import { z } from "zod";

export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((value) => {
    const parsed = new Date(`${value}-01T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 7) === value;
  }, "Month must use YYYY-MM")
});

export const createBookingSchema = z.object({
  techProfileId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  requestKey: z.string().uuid()
}).strict();

export const rescheduleBookingSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
  version: z.number().int().nonnegative(),
  requestKey: z.string().uuid(),
  reason: z.string().trim().max(500).optional()
}).strict();

export const bookingIdParamSchema = z.string().uuid();

export const rescheduleAvailabilityQuerySchema = availabilityQuerySchema.pick({ month: true }).strict();
