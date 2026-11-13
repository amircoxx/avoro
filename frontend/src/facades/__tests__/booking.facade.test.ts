import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/api";

const { createBooking, getMonthAvailability, getTechProfile } = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getMonthAvailability: vi.fn(),
  getTechProfile: vi.fn()
}));

vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  createBooking,
  getMonthAvailability,
  getTechProfile
}));

import { createBookingFacade } from "../booking.facade";

describe("booking facade", () => {
  beforeEach(() => vi.resetAllMocks());

  it("loads the public profile and keeps only complete bookable services", async () => {
    getTechProfile.mockResolvedValue(profile());

    await expect(createBookingFacade().loadBookingPage("tech-1")).resolves.toMatchObject({
      profile: { id: "tech-1" },
      services: [{ id: "service-1", name: "Structured manicure" }]
    });
  });

  it("loads a requested service month through the booking transport", async () => {
    getMonthAvailability.mockResolvedValue(availability());

    await expect(createBookingFacade().loadMonth("tech-1", "service-1", "2026-07")).resolves.toEqual(availability());
    expect(getMonthAvailability).toHaveBeenCalledWith("tech-1", "service-1", "2026-07");
  });

  it("retains one cryptographically generated request key across the same confirmation retry", async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("3a263184-5fd8-4bfd-aeff-43d1375c255a");
    createBooking.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce(booking());
    const facade = createBookingFacade();
    const input = confirmationInput();

    await expect(facade.confirmBooking(input)).rejects.toThrow("network unavailable");
    await expect(facade.confirmBooking(input)).resolves.toMatchObject({ kind: "confirmed", booking: { id: "booking-1" } });

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(createBooking).toHaveBeenNthCalledWith(1, expect.objectContaining({ requestKey: "3a263184-5fd8-4bfd-aeff-43d1375c255a" }));
    expect(createBooking).toHaveBeenNthCalledWith(2, expect.objectContaining({ requestKey: "3a263184-5fd8-4bfd-aeff-43d1375c255a" }));
  });

  it("uses independent promises and request keys for different customers confirming the same slot", async () => {
    const first = deferred<ReturnType<typeof booking>>();
    const second = deferred<ReturnType<typeof booking>>();
    createBooking.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const keys = ["request-a", "request-b"];
    const facade = createBookingFacade({ makeRequestKey: () => keys.shift()! });
    const customerA = confirmationInput({ customerId: "customer-a" });
    const customerB = confirmationInput({ customerId: "customer-b" });

    const savingA = facade.confirmBooking(customerA);
    const savingB = facade.confirmBooking(customerB);

    expect(savingA).not.toBe(savingB);
    expect(createBooking).toHaveBeenCalledTimes(2);
    expect(createBooking).toHaveBeenNthCalledWith(1, {
      techProfileId: "tech-1",
      serviceId: "service-1",
      startAt: "2026-07-14T15:00:00.000Z",
      requestKey: "request-a"
    });
    expect(createBooking).toHaveBeenNthCalledWith(2, {
      techProfileId: "tech-1",
      serviceId: "service-1",
      startAt: "2026-07-14T15:00:00.000Z",
      requestKey: "request-b"
    });

    first.resolve(booking({ customerId: "customer-a" }));
    second.resolve(booking({ id: "booking-2", customerId: "customer-b" }));
    await expect(savingA).resolves.toMatchObject({ kind: "confirmed", booking: { customerId: "customer-a" } });
    await expect(savingB).resolves.toMatchObject({ kind: "confirmed", booking: { customerId: "customer-b" } });
  });

  it("shares the same in-flight cache entry across a same-customer same-route remount", async () => {
    const pending = deferred<ReturnType<typeof booking>>();
    createBooking.mockReturnValueOnce(pending.promise);
    const facade = createBookingFacade({ makeRequestKey: () => "same-owner-key" });
    const input = confirmationInput();

    const firstMount = facade.confirmBooking(input);
    const remount = facade.confirmBooking({ ...input });

    expect(remount).toBe(firstMount);
    expect(createBooking).toHaveBeenCalledTimes(1);
    pending.resolve(booking());
    await expect(remount).resolves.toMatchObject({ kind: "confirmed", booking: { id: "booking-1" } });
  });

  it("rejects a confirmed response owned by a different customer", async () => {
    createBooking.mockResolvedValue(booking({ customerId: "customer-b" }));

    await expect(createBookingFacade({ makeRequestKey: () => "request-a" }).confirmBooking(
      confirmationInput({ customerId: "customer-a" })
    )).rejects.toThrow("Booking confirmation owner did not match the signed-in customer");
  });

  it("classifies a booking race immediately without coupling conflict recovery to a refresh", async () => {
    createBooking.mockRejectedValue(new ApiClientError({ status: 409, code: "booking_conflict", message: "That time is no longer available" }));

    await expect(createBookingFacade({ makeRequestKey: () => "request-1" }).confirmBooking(confirmationInput())).resolves.toMatchObject({
      kind: "conflict",
      message: "That time is no longer available"
    });
    expect(getMonthAvailability).not.toHaveBeenCalled();
  });

  it("keeps overlapping logical confirmations from clearing each other's request keys", async () => {
    const first = deferred<ReturnType<typeof booking>>();
    const second = deferred<ReturnType<typeof booking>>();
    createBooking.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValueOnce(booking({ id: "booking-2" }));
    const keys = ["request-a", "request-b", "request-c"];
    const facade = createBookingFacade({ makeRequestKey: () => keys.shift()! });
    const inputA = confirmationInput();
    const inputB = { ...confirmationInput(), startAt: "2026-07-14T15:30:00.000Z" };

    const savingA = facade.confirmBooking(inputA);
    const savingB = facade.confirmBooking(inputB);
    first.resolve(booking());
    await expect(savingA).resolves.toMatchObject({ kind: "confirmed" });
    second.reject(new Error("ambiguous network failure"));
    await expect(savingB).rejects.toThrow("ambiguous network failure");
    await facade.confirmBooking(inputB);

    expect(createBooking).toHaveBeenNthCalledWith(1, expect.objectContaining({ requestKey: "request-a" }));
    expect(createBooking).toHaveBeenNthCalledWith(2, expect.objectContaining({ requestKey: "request-b" }));
    expect(createBooking).toHaveBeenNthCalledWith(3, expect.objectContaining({ requestKey: "request-b" }));
  });

  it("deduplicates identical in-flight confirmations and retains their key after an ambiguous failure", async () => {
    const first = deferred<ReturnType<typeof booking>>();
    createBooking.mockReturnValueOnce(first.promise).mockResolvedValueOnce(booking());
    const facade = createBookingFacade({ makeRequestKey: () => "shared-request-key" });
    const input = confirmationInput();

    const savingA = facade.confirmBooking(input);
    const savingB = facade.confirmBooking(input);
    expect(createBooking).toHaveBeenCalledTimes(1);

    first.reject(new Error("connection closed before response"));
    await expect(savingA).rejects.toThrow("connection closed before response");
    await expect(savingB).rejects.toThrow("connection closed before response");
    await facade.confirmBooking(input);

    expect(createBooking).toHaveBeenCalledTimes(2);
    expect(createBooking).toHaveBeenNthCalledWith(1, expect.objectContaining({ requestKey: "shared-request-key" }));
    expect(createBooking).toHaveBeenNthCalledWith(2, expect.objectContaining({ requestKey: "shared-request-key" }));
  });

  it("does not flatten non-conflict confirmation failures", async () => {
    createBooking.mockRejectedValue(new ApiClientError({ status: 500, code: "server_error", message: "Booking could not be created" }));

    await expect(createBookingFacade({ makeRequestKey: () => "request-1" }).confirmBooking(confirmationInput())).rejects.toThrow("Booking could not be created");
    expect(getMonthAvailability).not.toHaveBeenCalled();
  });
});

function profile() {
  return {
    id: "tech-1",
    businessName: "The Nail Study",
    displayName: "Mia Chen",
    bio: null,
    phone: null,
    email: null,
    instagramUrl: null,
    bookingEnabled: true,
    bookingTimeZone: "America/New_York",
    specialties: ["Gel-X"],
    averageRating: 5,
    reviewCount: 4,
    publicLocationLabel: "Charlotte, NC",
    profileImage: null,
    backgroundImage: null,
    galleryImages: [],
    services: [
      { id: "service-1", name: "Structured manicure", description: "Detailed gel service", durationMinutes: 90, startingPriceCents: 9500 },
      { id: "service-2", name: "Consultation", description: null, durationMinutes: null, startingPriceCents: null }
    ],
    reviews: []
  };
}

function availability(slot = { startAt: "2026-07-14T15:00:00.000Z", localTime: "11:00 AM" }) {
  return {
    month: "2026-07",
    timeZone: "America/New_York",
    cancellationCutoffMinutes: 1440,
    service: { id: "service-1", name: "Structured manicure", durationMinutes: 90, startingPriceCents: 9500 },
    slots: [{ ...slot, localDate: "2026-07-14", timeZone: "America/New_York" }]
  };
}

function confirmationInput(overrides: { customerId?: string } = {}) {
  return {
    customerId: overrides.customerId ?? "customer-1",
    techProfileId: "tech-1",
    serviceId: "service-1",
    startAt: "2026-07-14T15:00:00.000Z",
    month: "2026-07"
  };
}

function booking(overrides: { id?: string; customerId?: string } = {}) {
  return { id: overrides.id ?? "booking-1", customerId: overrides.customerId ?? "customer-1" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}
