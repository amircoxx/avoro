/** Zod contract for the public city-autocomplete query string. */
import { z } from "zod";

export const locationAutocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(120)
});

export type LocationAutocompleteQuery = z.infer<typeof locationAutocompleteQuerySchema>;
