/** Zod contract for the tech onboarding and profile-editing payload. */
import { z } from "zod";

const httpsUrlField = z
  .string()
  .trim()
  .max(500)
  .superRefine((value, context) => {
    if (value === "") return;

    let url: URL;

    try {
      url = new URL(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid URL"
      });
      return;
    }

    if (url.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL must use HTTPS"
      });
    }
  });

export const locationVisibilitySchema = z.enum([
  "radius_only",
  "city_only",
  "exact_business_address"
]);

export const techProfileInputSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(2000).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().email().max(255).optional(),
  instagramUrl: httpsUrlField,
  tiktokUrl: httpsUrlField,
  profileImageUrl: z.string().url().max(500).optional(),
  specialties: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  isPublished: z.boolean().default(false),
  referredByCode: z.string().trim().min(4).max(32).optional(),
  location: z.object({
    privateAddressLine1: z.string().trim().max(255).optional(),
    privateAddressLine2: z.string().trim().max(255).optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().length(2).default("US"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    publicLocationLabel: z.string().trim().min(1).max(160),
    locationVisibility: locationVisibilitySchema.default("radius_only"),
    publicRadiusMiles: z.number().int().min(1).max(50).default(5)
  })
});

export type TechProfileInput = z.infer<typeof techProfileInputSchema>;
