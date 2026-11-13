/** Stable browser contracts for direct-booking and tech scheduling resources. */
export type BookingStatus = "CONFIRMED" | "CANCELED";

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
  status: BookingStatus;
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

export type MonthAvailability = {
  month: string;
  timeZone: string;
  cancellationCutoffMinutes: number;
  service: { id: string; name: string; durationMinutes: number; startingPriceCents: number };
  slots: Array<{ startAt: string; localDate: string; localTime: string; timeZone: string }>;
};

export type CreateBookingInput = {
  techProfileId: string;
  serviceId: string;
  startAt: string;
  requestKey: string;
};

export type RescheduleBookingInput = {
  startAt: string;
  version: number;
  requestKey: string;
  reason?: string;
};

export type CustomerBookings = {
  upcoming: BookingDto[];
  past: BookingDto[];
  canceled: BookingDto[];
};

export type ScheduleService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number | null;
  startingPriceCents: number | null;
  isActive: boolean;
};

export type ScheduleServiceWrite = {
  name: string;
  description: string;
  durationMinutes: number;
  startingPriceCents: number;
  isActive: boolean;
};

export type AvailabilityWindow = { startMinute: number; endMinute: number };
export type WeeklyAvailabilityInput = { weekday: number; windows: AvailabilityWindow[] };
export type WeeklyAvailabilityWindow = AvailabilityWindow & { weekday: number };

export type ScheduleSettings = {
  timeZone: string;
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
  bufferMinutes: number;
  cancellationCutoffMinutes: number;
};

export type AvailabilityOverride = {
  localDate: string;
  kind: "unavailable" | "custom";
  windows: AvailabilityWindow[];
};

export type AvailabilityOverrideWrite =
  | { kind: "unavailable" }
  | { kind: "custom"; windows: AvailabilityWindow[] };

export type ScheduleWarning = {
  bookingId: string;
  startAt: string;
  timeZoneSnapshot: string;
  message: "Existing booking falls outside the updated availability";
};

export type Schedule = {
  settings: ScheduleSettings | null;
  weeklyAvailability: WeeklyAvailabilityWindow[];
  overrides: AvailabilityOverride[];
};

export type ScheduleWriteResult<T> = T & { warnings: ScheduleWarning[] };
export type CalendarBookingRange = { from: string; to: string };

export type RescheduleAvailability = MonthAvailability & { bookingId: string; version: number };
