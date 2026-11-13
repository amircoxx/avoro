/** Parses and validates city-search query parameters before they reach the search service. */
import { z } from "zod";

function numberFromSearchParam(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export const searchQuerySchema = z.object({
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().max(80).transform((value) => value.toUpperCase()).optional(),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()).default("US"),
  limit: z.preprocess(
    numberFromSearchParam,
    z.number().int().positive().max(50).default(20)
  ),
  offset: z.preprocess(
    numberFromSearchParam,
    z.number().int().min(0).default(0)
  )
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
