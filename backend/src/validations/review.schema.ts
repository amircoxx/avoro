/** Zod contract for a customer's rating and comment submission. */
import { z } from "zod";

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional()
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;
