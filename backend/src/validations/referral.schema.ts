/** Zod contract for recording a referral between two tech profiles. */
import { z } from "zod";

export const referralInputSchema = z.object({
  referralCode: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(/^[A-Z0-9-]+$/i, "Referral code can only contain letters, numbers, and hyphens")
    .transform((value) => value.toUpperCase())
});

export type ReferralInput = z.infer<typeof referralInputSchema>;
