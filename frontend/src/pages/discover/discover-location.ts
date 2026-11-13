import type { SearchLocation } from "@/services/api";

/** Converts a manually entered city label into the location contract used by search. */
export function parseTypedLocation(location: string): SearchLocation | null {
  const trimmed = location.trim();
  if (!trimmed) return null;

  const [cityPart, statePart] = trimmed.split(",").map((part) => part.trim());
  return { city: cityPart || trimmed, state: statePart || "", country: "US" };
}
