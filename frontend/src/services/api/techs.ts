/** Browser API operations for discovery, featured results, saves, and reviews. */
import { apiUrl, readApiResponse } from "./client";
import type { AuthUser, PublicTechProfile, SearchLocation } from "./types";

export function toSearchParams(location: SearchLocation) {
  const params = new URLSearchParams({
    city: location.city
  });

  if (location.state) params.set("state", location.state);
  params.set("country", location.country || "US");
  return params;
}

export async function searchTechs(location: SearchLocation) {
  const response = await fetch(apiUrl(`/api/techs/search?${toSearchParams(location).toString()}`));
  return readApiResponse<PublicTechProfile[]>(response, "Search failed");
}

export async function getFeaturedTechs(limit = 6){
  const response = await fetch(apiUrl(`/api/techs/featured?limit=${limit}`));
  return readApiResponse<PublicTechProfile[]>(response, "Failed to load featured techs");
}

export async function getSavedTechs() {
  const response = await fetch(apiUrl("/api/saved-techs"), { credentials: "include" });
  return readApiResponse<PublicTechProfile[]>(response, "Saved techs could not be loaded");
}

export async function saveTech(techId: string) {
  const response = await fetch(apiUrl(`/api/techs/${encodeURIComponent(techId)}/saved`), {
    method: "PUT",
    credentials: "include"
  });
  return readApiResponse<{ saved: true }>(response, "Tech could not be saved");
}

export async function removeSavedTech(techId: string) {
  const response = await fetch(apiUrl(`/api/techs/${encodeURIComponent(techId)}/saved`), {
    method: "DELETE",
    credentials: "include"
  });
  return readApiResponse<{ saved: false }>(response, "Saved tech could not be removed");
}

export async function submitReview(techId: string, input: { rating: number; comment: string }) {
  const response = await fetch(apiUrl(`/api/techs/${encodeURIComponent(techId)}/reviews`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readApiResponse(response, "Review could not be saved");
}
