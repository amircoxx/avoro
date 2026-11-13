import { describe, expect, it } from "vitest";
import { buildTechProfilePayload, mapTechProfileToArtist } from "../api/profiles";
import { ApiClientError, readApiResponse } from "../api/client";
import { initialTechOnboardingForm, type PublicTechProfile } from "../api/types";

describe("tech profile payload", () => {
  it("sends a pending referral code with a new tech profile", () => {
    const payload = buildTechProfilePayload(
      { ...initialTechOnboardingForm, businessName: "Gloss Room", displayName: "Mia", referredByCode: "GLOSS-1" } as typeof initialTechOnboardingForm,
      { id: "charlotte", label: "Charlotte, NC", city: "Charlotte", state: "NC", country: "US", lat: 35.2, lng: -80.8 }
    );

    expect(payload.referredByCode).toBe("GLOSS-1");
  });

  it("does not let profile saves own service or external booking data", () => {
    const payload = buildTechProfilePayload(
      { ...initialTechOnboardingForm, businessName: "Gloss Room", displayName: "Mia" },
      { id: "charlotte", label: "Charlotte, NC", city: "Charlotte", state: "NC", country: "US", lat: 35.2, lng: -80.8 }
    );

    expect(payload).not.toHaveProperty("services");
    expect(payload).not.toHaveProperty("bookingUrl");
  });
});

describe("structured API errors", () => {
  it("retains HTTP status, backend code, message, and validation issues", async () => {
    const payload = {
      error: {
        code: "booking_conflict",
        message: "That time was just booked",
        issues: { fieldErrors: { startAt: ["Choose another time"] } }
      }
    };
    const response = new Response(JSON.stringify(payload), { status: 409 });

    await expect(readApiResponse(response, "Booking could not be created")).rejects.toBeInstanceOf(ApiClientError);
    await readApiResponse(new Response(JSON.stringify(payload), { status: 409 }), "Booking could not be created").catch((error: unknown) => {
      expect(error).toMatchObject({
        name: "ApiClientError",
        status: 409,
        code: "booking_conflict",
        issues: { fieldErrors: { startAt: ["Choose another time"] } }
      });
      expect((error as Error).message).toBe("That time was just booked: startAt: Choose another time");
      expect(error).toBeInstanceOf(Error);
    });
  });
});

describe("public tech profile mapping", () => {
  it("uses neutral display values when the API profile has no optional marketplace data", () => {
    const artist = mapTechProfileToArtist(
      {
        id: "tech-1",
        businessName: "Gloss Room",
        displayName: "Mia",
        bio: null,
        phone: null,
        email: null,
        instagramUrl: null,
        bookingEnabled: false,
        bookingTimeZone: null,
        specialties: [],
        averageRating: 0,
        reviewCount: 0,
        publicLocationLabel: "Atlanta, GA",
        profileImage: null,
        backgroundImage: null,
        galleryImages: [],
        services: [],
        reviews: [
          {
            id: "review-1",
            rating: 5,
            comment: "Loved the service.",
            createdAt: "2026-07-14T12:00:00.000Z"
          }
        ]
      } satisfies PublicTechProfile,
      0
    );

    expect(artist).toMatchObject({
      photo: "",
      cover: "",
      gallery: [],
      distance: "",
      rating: 0,
      tags: [],
      priceLabel: "Contact for pricing"
    });
    expect(artist.type).toBeUndefined();
    expect(artist.available).toBeUndefined();
    expect(artist.featured).toBeUndefined();
    expect(artist.reviews[0]).toEqual({
      rating: 5,
      text: "Loved the service.",
      date: new Date("2026-07-14T12:00:00.000Z").toLocaleDateString()
    });
  });
});
