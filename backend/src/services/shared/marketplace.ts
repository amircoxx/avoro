/** Shared Prisma includes and pure mapping helpers used by marketplace services. */
import type {
  LocationVisibility,
  ProfileMedia,
  Prisma,
  Review,
  TechLocation,
  TechProfile,
  TechService
} from "@prisma/client";
import { AppError } from "../../utils/errors";

type ProfileWithPublicRelations = TechProfile & {
  location: TechLocation | null;
  services: TechService[];
  scheduleSettings?: { id: string; timeZone: string } | null;
  weeklyAvailability?: Array<{ id: string }>;
  profileMedia: ProfileMedia[];
  reviews: Review[];
};

export const profileInclude = {
  location: true,
  services: { orderBy: { createdAt: "asc" } },
  scheduleSettings: { select: { id: true, timeZone: true } },
  weeklyAvailability: { select: { id: true }, take: 1 },
  profileMedia: { orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
  reviews: { orderBy: { createdAt: "desc" } }
} satisfies Prisma.TechProfileInclude;

export function toProfileMediaDto(media: ProfileMedia) {
  return {
    id: media.id,
    imageUrl: media.imageDataUrl ?? media.storagePath,
    altText: media.altText,
    sortOrder: media.sortOrder
  };
}

export function groupProfileMedia(media: ProfileMedia[]) {
  const profileImage = media.find((item) => item.role === "PROFILE");
  const backgroundImage = media.find((item) => item.role === "BACKGROUND");

  return {
    profileImage: profileImage ? toProfileMediaDto(profileImage) : null,
    backgroundImage: backgroundImage ? toProfileMediaDto(backgroundImage) : null,
    galleryImages: media.filter((item) => item.role === "GALLERY").map(toProfileMediaDto)
  };
}

export function calculateDistanceMiles(latA: number, lngA: number, latB: number, lngB: number) {
  const earthRadiusMiles = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(latB - latA);
  const lngDelta = toRadians(lngB - lngA);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toPublicTechProfile(profile: ProfileWithPublicRelations) {
  if (!profile.location) {
    throw new AppError("Tech profile is missing location", 500, "missing_location");
  }

  return {
    id: profile.id,
    businessName: profile.businessName,
    displayName: profile.displayName,
    bio: profile.bio,
    phone: profile.phone,
    email: profile.email,
    instagramUrl: profile.instagramUrl,
    tiktokUrl: profile.tiktokUrl,
    bookingEnabled: Boolean(profile.scheduleSettings) && (profile.weeklyAvailability?.length ?? 0) > 0 && profile.services.some(
      (service) => service.isActive && service.durationMinutes !== null && service.startingPriceCents !== null
    ),
    bookingTimeZone: profile.scheduleSettings?.timeZone ?? null,
    ...groupProfileMedia(profile.profileMedia ?? []),
    specialties: profile.specialties,
    averageRating: profile.averageRating,
    reviewCount: profile.reviewCount,
    publicLocationLabel: profile.location.publicLocationLabel,
    city: profile.location.city,
    state: profile.location.state,
    country: profile.location.country,
    locationVisibility: fromDbLocationVisibility(profile.location.locationVisibility),
    publicRadiusMiles: profile.location.publicRadiusMiles,
    services: profile.services.filter((service) => service.isActive).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      startingPriceCents: service.startingPriceCents,
      durationMinutes: service.durationMinutes
    })),
    reviews: profile.reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt
    }))
  };
}

export function toOwnerTechProfile(profile: ProfileWithPublicRelations) {
  if (!profile.location) {
    throw new AppError("Tech profile is missing location", 500, "missing_location");
  }

  return {
    ...toPublicTechProfile(profile),
    referralCode: profile.referralCode,
    isPublished: profile.isPublished,
    latitude: profile.location.latitude,
    longitude: profile.location.longitude
  };
}

function fromDbLocationVisibility(value: LocationVisibility) {
  switch (value) {
    case "CITY_ONLY":
      return "city_only";
    case "EXACT_BUSINESS_ADDRESS":
      return "exact_business_address";
    default:
      return "radius_only";
  }
}

export function publicCoordinate(value: number, visibility: LocationVisibility) {
  if (visibility === "EXACT_BUSINESS_ADDRESS") return value;
  return Math.round(value * 10) / 10;
}
