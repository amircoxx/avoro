import { describe, expect, it } from "vitest";
import { techProfileInputSchema } from "../tech-profile.schema";

const instagramUrlSchema = techProfileInputSchema.shape.instagramUrl;

describe("tech profile URL validation", () => {
  it.each([
    ["", true],
    ["https://instagram.com/example", true],
    ["http://example.com", false],
    ["javascript:alert(1)", false],
    ["not a url", false]
  ])("handles %s without throwing", (value, expectedValid) => {
    expect(() => instagramUrlSchema.safeParse(value)).not.toThrow();
    expect(instagramUrlSchema.safeParse(value).success).toBe(expectedValid);
  });

  it("strips deprecated services and booking URLs from profile saves", () => {
    const result = techProfileInputSchema.parse({
      businessName: "Gloss Room",
      displayName: "Mia",
      instagramUrl: "",
      tiktokUrl: "",
      bookingUrl: "https://legacy-booking.example.com",
      services: [{ name: "Legacy service" }],
      location: {
        city: "Charlotte",
        state: "NC",
        latitude: 35.2,
        longitude: -80.8,
        publicLocationLabel: "Charlotte, NC"
      }
    });

    expect(result).not.toHaveProperty("bookingUrl");
    expect(result).not.toHaveProperty("services");
  });
});
