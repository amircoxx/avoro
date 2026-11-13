/** Browser API operations and mappings for owner and public tech profiles. */
import { apiUrl, readApiResponse } from "./client";
import type { LocationSuggestion, OwnerTechProfile, PublicTechProfile, TechOnboardingForm } from "./types";

export type ArtistType = "Nail Tech" | "Lash Tech";

export interface Service {
  name: string;
  price: string;
}

export interface Review {
  rating: number;
  text: string;
  date: string;
}

export interface Artist {
  id: number;
  name: string;
  handle: string;
  type?: ArtistType;
  specialty: string;
  location: string;
  distance: string;
  rating: number;
  reviewCount: number;
  priceLabel: string;
  priceMin: number;
  tags: string[];
  bio: string;
  photo: string;
  cover: string;
  gallery: string[];
  services: Service[];
  reviews: Review[];
  available?: boolean;
  featured?: boolean;
  backendId?: string;
}

export async function getOwnTechProfile() {
  const response = await fetch(apiUrl("/api/techs"), { credentials: "include" });
  const data = await readApiResponse<{ profile: OwnerTechProfile | null }>(response, "Profile could not be loaded");
  return data.profile;
}

export async function getTechProfile(techId: string) {
  const response = await fetch(apiUrl(`/api/techs/${encodeURIComponent(techId)}`));
  return readApiResponse<PublicTechProfile>(response, "Artist could not be loaded");
}

export async function saveTechProfile(form: TechOnboardingForm, location: LocationSuggestion) {
  const response = await fetch(apiUrl("/api/techs"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildTechProfilePayload(form, location))
  });
  return readApiResponse<PublicTechProfile & { referralCode: string }>(response, "Profile could not be saved");
}

export function mapTechProfileToArtist(tech: PublicTechProfile, index: number): Artist {
  const firstPrice = tech.services.find((service) => service.startingPriceCents !== null)?.startingPriceCents ?? null;
  const priceMin = firstPrice === null ? 0 : Math.round(firstPrice / 100);

  return {
    id: 1000 + index,
    backendId: tech.id,
    name: tech.businessName || tech.displayName,
    handle: tech.displayName,
    specialty: tech.specialties[0] || "",
    location: tech.publicLocationLabel,
    distance: "",
    rating: tech.averageRating,
    reviewCount: tech.reviewCount,
    priceLabel: firstPrice === null ? "Contact for pricing" : `From $${priceMin}`,
    priceMin,
    tags: tech.specialties.slice(0, 3),
    bio: tech.bio ?? "",
    photo: tech.profileImage?.imageUrl ?? "",
    cover: tech.backgroundImage?.imageUrl ?? "",
    gallery: tech.galleryImages.map((photo) => photo.imageUrl),
    services: tech.services.map((service) => ({
      name: service.name,
      price: service.startingPriceCents === null ? "Contact for pricing" : `$${Math.round(service.startingPriceCents / 100)}`
    })),
    reviews: tech.reviews.map((review) => ({
      rating: review.rating,
      text: review.comment,
      date: new Date(review.createdAt).toLocaleDateString()
    }))
  };
}

export function buildTechProfilePayload(form: TechOnboardingForm, location: LocationSuggestion) {
  return {
    businessName: form.businessName,
    displayName: form.displayName,
    bio: form.bio || undefined,
    phone: form.phone || undefined,
    email: form.email || undefined,
    instagramUrl: form.instagramUrl,
    tiktokUrl: "",
    specialties: form.specialties
      .split(",")
      .map((specialty) => specialty.trim())
      .filter(Boolean),
    isPublished: form.isPublished,
    referredByCode: form.referredByCode || undefined,
    location: {
      city: location.city || location.label,
      state: location.state || "NA",
      country: location.country || "US",
      latitude: location.lat,
      longitude: location.lng,
      publicLocationLabel: location.label,
      locationVisibility: "city_only",
      publicRadiusMiles: 5
    }
  };
}

export function mapOwnerTechProfileToOnboardingState(profile: OwnerTechProfile): {
  form: TechOnboardingForm;
  location: LocationSuggestion;
} {
  return {
    form: {
      businessName: profile.businessName,
      displayName: profile.displayName,
      bio: profile.bio ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      instagramUrl: profile.instagramUrl ?? "",
      specialties: profile.specialties.join(", "),
      isPublished: profile.isPublished,
      referredByCode: ""
    },
    location: {
      id: `${profile.id}-location`,
      label: profile.publicLocationLabel,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      lat: profile.latitude,
      lng: profile.longitude
    }
  };
}
