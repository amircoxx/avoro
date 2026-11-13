/** Coordinates focused tech-schedule API calls without changing their response contracts. */
import {
  createScheduleService,
  cancelBooking,
  deleteAvailabilityOverride,
  getSchedule,
  getScheduleBookings,
  getScheduleServices,
  replaceWeeklyAvailability,
  saveAvailabilityOverride,
  saveScheduleSettings,
  updateScheduleService,
  type AvailabilityOverride,
  type AvailabilityOverrideWrite,
  type CalendarBookingRange,
  type Schedule,
  type ScheduleService,
  type ScheduleServiceWrite,
  type ScheduleSettings,
  type ScheduleWriteResult,
  type TechCalendarBookingDto,
  type WeeklyAvailabilityInput,
  type WeeklyAvailabilityWindow
} from "@/services/api";

export type ScheduleWorkspace = {
  schedule: Schedule;
  services: ScheduleService[];
};

export interface ScheduleFacade {
  loadScheduleWorkspace(): Promise<ScheduleWorkspace>;
  loadBookings(range: CalendarBookingRange): Promise<TechCalendarBookingDto[]>;
  cancelBooking(bookingId: string): ReturnType<typeof cancelBooking>;
  saveSettings(input: ScheduleSettings): Promise<ScheduleWriteResult<{ settings: ScheduleSettings }>>;
  saveWeeklyAvailability(input: WeeklyAvailabilityInput[]): Promise<ScheduleWriteResult<{ weeklyAvailability: WeeklyAvailabilityWindow[] }>>;
  saveOverride(localDate: string, input: AvailabilityOverrideWrite): Promise<ScheduleWriteResult<AvailabilityOverride>>;
  deleteOverride(localDate: string): Promise<ScheduleWriteResult<{ localDate: string }>>;
  createService(input: ScheduleServiceWrite): Promise<ScheduleService>;
  updateService(serviceId: string, input: ScheduleServiceWrite): Promise<ScheduleService>;
}

export const defaultScheduleFacade: ScheduleFacade = {
  async loadScheduleWorkspace() {
    const [schedule, services] = await Promise.all([
      getSchedule(),
      getScheduleServices()
    ]);
    return { schedule, services };
  },
  loadBookings: getScheduleBookings,
  cancelBooking,
  saveSettings: saveScheduleSettings,
  saveWeeklyAvailability: replaceWeeklyAvailability,
  saveOverride: saveAvailabilityOverride,
  deleteOverride: deleteAvailabilityOverride,
  createService: createScheduleService,
  updateService: updateScheduleService
};
