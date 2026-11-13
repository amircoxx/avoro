/** Composes session, search, featured, and save behavior for the discover screen. */
import {
  getFeaturedTechs,
  getSavedTechs,
  mapTechProfileToArtist,
  removeSavedTech,
  saveTech,
  searchTechs,
  type AuthUser,
  type Artist,
  type SearchLocation
} from "@/services/api";

export async function loadSavedTechIds(user: AuthUser | null): Promise<Set<string>> {
  if (user?.role !== "CUSTOMER") return new Set();

  try {
    const savedTechs = await getSavedTechs();
    return new Set(savedTechs.map((tech) => tech.id));
  } catch {
    return new Set();
  }
}

export async function loadFeaturedArtists(limit: number): Promise<Artist[]> {
  return (await getFeaturedTechs(limit))
    .map(mapTechProfileToArtist)
    .filter((artist) => artist.reviewCount > 0);
}

export async function searchArtists(location: SearchLocation): Promise<Artist[]> {
  return (await searchTechs(location)).map(mapTechProfileToArtist);
}

export function toggleSavedTech(techId: string, isSaved: boolean) {
  return isSaved ? removeSavedTech(techId) : saveTech(techId);
}
