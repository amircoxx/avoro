/** Owns customer booking transport, idempotency, and conflict recovery. */
import {
  ApiClientError,
  createBooking,
  getMonthAvailability,
  getTechProfile,
  type BookingDto,
  type MonthAvailability,
  type PublicTechProfile
} from "@/services/api";

export type BookableService = PublicTechProfile["services"][number] & {
  durationMinutes: number;
  startingPriceCents: number;
};

export type BookingPageData = {
  profile: PublicTechProfile;
  services: BookableService[];
};

export type ConfirmBookingSelection = {
  customerId: string;
  techProfileId: string;
  serviceId: string;
  startAt: string;
  month: string;
};

export type ConfirmBookingResult =
  | { kind: "confirmed"; booking: BookingDto }
  | { kind: "conflict"; message: string };

export type BookingFacade = {
  loadBookingPage: (techId: string) => Promise<BookingPageData>;
  loadMonth: (techId: string, serviceId: string, month: string) => Promise<MonthAvailability>;
  confirmBooking: (input: ConfirmBookingSelection) => Promise<ConfirmBookingResult>;
};

type BookingFacadeDependencies = {
  loadProfile: typeof getTechProfile;
  loadAvailability: typeof getMonthAvailability;
  saveBooking: typeof createBooking;
  makeRequestKey: () => string;
};

export function createBookingFacade(overrides: Partial<BookingFacadeDependencies> = {}): BookingFacade {
  const dependencies: BookingFacadeDependencies = {
    loadProfile: getTechProfile,
    loadAvailability: getMonthAvailability,
    saveBooking: createBooking,
    makeRequestKey: () => crypto.randomUUID(),
    ...overrides
  };
  const confirmations = new Map<string, { requestKey: string; inFlight?: Promise<ConfirmBookingResult> }>();

  return {
    async loadBookingPage(techId) {
      const profile = await dependencies.loadProfile(techId);
      const services = profile.services.filter((service): service is BookableService =>
        service.durationMinutes !== null && service.startingPriceCents !== null
      );
      return { profile, services };
    },

    loadMonth(techId, serviceId, month) {
      return dependencies.loadAvailability(techId, serviceId, month);
    },

    confirmBooking(input) {
      const fingerprint = `${input.customerId}\u0000${input.techProfileId}\u0000${input.serviceId}\u0000${input.startAt}`;
      const confirmation = confirmations.get(fingerprint) ?? { requestKey: dependencies.makeRequestKey() };
      confirmations.set(fingerprint, confirmation);
      if (confirmation.inFlight) return confirmation.inFlight;

      const operation = dependencies.saveBooking({
          techProfileId: input.techProfileId,
          serviceId: input.serviceId,
          startAt: input.startAt,
          requestKey: confirmation.requestKey
        })
        .then<ConfirmBookingResult>((booking) => {
          if (booking.customerId !== input.customerId) {
            throw new Error("Booking confirmation owner did not match the signed-in customer");
          }
          if (confirmations.get(fingerprint) === confirmation) confirmations.delete(fingerprint);
          return { kind: "confirmed", booking };
        })
        .catch((error: unknown) => {
          if (error instanceof ApiClientError && error.code === "booking_conflict") {
            if (confirmations.get(fingerprint) === confirmation) confirmations.delete(fingerprint);
            return { kind: "conflict", message: error.message } satisfies ConfirmBookingResult;
          }
          if (confirmations.get(fingerprint) === confirmation) confirmation.inFlight = undefined;
          throw error;
        });
      confirmation.inFlight = operation;
      return operation;
    }
  };
}

const defaultBookingFacade = createBookingFacade();

export const loadBookingPage = defaultBookingFacade.loadBookingPage;
export const loadMonth = defaultBookingFacade.loadMonth;
export const confirmBooking = defaultBookingFacade.confirmBooking;
export { defaultBookingFacade };
