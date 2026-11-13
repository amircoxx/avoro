/** Maps authenticated scheduling resource endpoints. */
import { Router } from "express";
import {
  createService,
  getScheduleSettings,
  listCalendarBookings,
  listServices,
  removeAvailabilityOverride,
  replaceWeeklyAvailability,
  saveAvailabilityOverride,
  saveScheduleSettings,
  updateService
} from "../controllers/schedule.controller";

export const scheduleRouter = Router();
scheduleRouter.get("/bookings", listCalendarBookings);
scheduleRouter.get("/services", listServices);
scheduleRouter.post("/services", createService);
scheduleRouter.patch("/services/:serviceId", updateService);
scheduleRouter.get("/settings", getScheduleSettings);
scheduleRouter.put("/settings", saveScheduleSettings);
scheduleRouter.put("/weekly-availability", replaceWeeklyAvailability);
scheduleRouter.put("/overrides/:localDate", saveAvailabilityOverride);
scheduleRouter.delete("/overrides/:localDate", removeAvailabilityOverride);
