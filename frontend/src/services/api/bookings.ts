/** Browser requests for the customer booking flow. */
import { apiUrl, readApiResponse } from "./client";
import type { BookingDto, CreateBookingInput, CustomerBookings, MonthAvailability, RescheduleBookingInput, RescheduleAvailability } from "./booking-types";

export async function getMonthAvailability(techId: string, serviceId: string, month: string): Promise<MonthAvailability> {
  const params = new URLSearchParams({ serviceId, month });
  const response = await fetch(apiUrl(`/api/techs/${encodeURIComponent(techId)}/availability?${params.toString()}`));
  return readApiResponse<MonthAvailability>(response, "Availability could not be loaded");
}

export async function createBooking(input: CreateBookingInput): Promise<BookingDto> {
  const response = await fetch(apiUrl("/api/bookings"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await readApiResponse<{ booking: BookingDto }>(response, "Booking could not be created");
  return data.booking;
}

export async function getCustomerBookings(): Promise<CustomerBookings> {
  const response = await fetch(apiUrl("/api/bookings"), { credentials: "include" });
  return readApiResponse<CustomerBookings>(response, "Bookings could not be loaded");
}

export async function cancelBooking(bookingId: string): Promise<BookingDto> {
  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`), {
    method: "POST",
    credentials: "include"
  });
  const data = await readApiResponse<{ booking: BookingDto }>(response, "Booking could not be canceled");
  return data.booking;
}

export async function rescheduleBooking(bookingId: string, input: RescheduleBookingInput): Promise<BookingDto> {
  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await readApiResponse<{ booking: BookingDto }>(response, "Booking could not be rescheduled");
  return data.booking;
}

export async function getRescheduleAvailability(bookingId: string, month: string): Promise<RescheduleAvailability> {
  const params = new URLSearchParams({ month });
  const response = await fetch(apiUrl(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule-availability?${params}`), {
    credentials: "include"
  });
  return readApiResponse<RescheduleAvailability>(response, "Rescheduling availability could not be loaded");
}
