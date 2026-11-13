/** Browser requests for tech-owned scheduling resources. */
import { apiUrl, readApiResponse } from "./client";
import type {
  AvailabilityOverride,
  AvailabilityOverrideWrite,
  CalendarBookingRange,
  Schedule,
  ScheduleService,
  ScheduleServiceWrite,
  ScheduleSettings,
  ScheduleWriteResult,
  TechCalendarBookingDto,
  WeeklyAvailabilityInput,
  WeeklyAvailabilityWindow
} from "./booking-types";

const jsonRequest = (method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export async function getSchedule(): Promise<Schedule> {
  const response = await fetch(apiUrl("/api/schedule/settings"), { credentials: "include" });
  return readApiResponse<Schedule>(response, "Schedule could not be loaded");
}

export async function saveScheduleSettings(input: ScheduleSettings): Promise<ScheduleWriteResult<{ settings: ScheduleSettings }>> {
  const response = await fetch(apiUrl("/api/schedule/settings"), jsonRequest("PUT", input));
  return readApiResponse<ScheduleWriteResult<{ settings: ScheduleSettings }>>(response, "Schedule settings could not be saved");
}

export async function replaceWeeklyAvailability(input: WeeklyAvailabilityInput[]): Promise<ScheduleWriteResult<{ weeklyAvailability: WeeklyAvailabilityWindow[] }>> {
  const response = await fetch(apiUrl("/api/schedule/weekly-availability"), jsonRequest("PUT", input));
  return readApiResponse<ScheduleWriteResult<{ weeklyAvailability: WeeklyAvailabilityWindow[] }>>(response, "Availability could not be saved");
}

export async function saveAvailabilityOverride(localDate: string, input: AvailabilityOverrideWrite): Promise<ScheduleWriteResult<AvailabilityOverride>> {
  const response = await fetch(apiUrl(`/api/schedule/overrides/${encodeURIComponent(localDate)}`), jsonRequest("PUT", input));
  return readApiResponse<ScheduleWriteResult<AvailabilityOverride>>(response, "Availability override could not be saved");
}

export async function deleteAvailabilityOverride(localDate: string): Promise<ScheduleWriteResult<{ localDate: string }>> {
  const response = await fetch(apiUrl(`/api/schedule/overrides/${encodeURIComponent(localDate)}`), {
    method: "DELETE",
    credentials: "include"
  });
  return readApiResponse<ScheduleWriteResult<{ localDate: string }>>(response, "Availability override could not be removed");
}

export async function getScheduleServices(): Promise<ScheduleService[]> {
  const response = await fetch(apiUrl("/api/schedule/services"), { credentials: "include" });
  return readApiResponse<ScheduleService[]>(response, "Services could not be loaded");
}

export async function createScheduleService(input: ScheduleServiceWrite): Promise<ScheduleService> {
  const response = await fetch(apiUrl("/api/schedule/services"), jsonRequest("POST", input));
  return readApiResponse<ScheduleService>(response, "Service could not be created");
}

export async function updateScheduleService(serviceId: string, input: ScheduleServiceWrite): Promise<ScheduleService> {
  const response = await fetch(apiUrl(`/api/schedule/services/${encodeURIComponent(serviceId)}`), jsonRequest("PATCH", input));
  return readApiResponse<ScheduleService>(response, "Service could not be updated");
}

export async function getScheduleBookings(range: CalendarBookingRange): Promise<TechCalendarBookingDto[]> {
  const params = new URLSearchParams(range);
  const response = await fetch(apiUrl(`/api/schedule/bookings?${params.toString()}`), { credentials: "include" });
  return readApiResponse<TechCalendarBookingDto[]>(response, "Bookings could not be loaded");
}
