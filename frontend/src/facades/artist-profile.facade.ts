/** Composes profile, save, and review API calls for the public artist-profile screen. */
import {
  getTechProfile,
  mapTechProfileToArtist,
  removeSavedTech,
  saveTech,
  submitReview,
  type Artist,
  type PublicTechProfile
} from "@/services/api";

export async function loadArtistProfile(techId: string): Promise<{ profile: PublicTechProfile; artist: Artist; isSaved: boolean }> {
  const profile = await getTechProfile(techId);
  return { profile, artist: mapTechProfileToArtist(profile, 0), isSaved: profile.isSaved ?? false };
}

export function toggleArtistSavedTech(techId: string, isSaved: boolean) {
  return isSaved ? removeSavedTech(techId) : saveTech(techId);
}

export async function submitArtistReview(techId: string, input: { rating: number; comment: string }) {
  await submitReview(techId, input);
  const profile = await getTechProfile(techId);
  return { profile, artist: mapTechProfileToArtist(profile, 0) };
}
