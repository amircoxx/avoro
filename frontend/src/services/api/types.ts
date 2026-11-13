/** Shared browser-facing API contracts; these keep components independent from transport details. */
export type LocationSuggestion = {
  id: string;
  label: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number;
  lng: number;
};

export type AuthUser = {
  id: string;
  email: string;
  role: "CUSTOMER" | "TECH" | "ADMIN";
  fullName: string | null;
  avatarUrl: string | null;
};

export type ProfileMedia = {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
};

export type TechProfileMedia = {
  profileImage: ProfileMedia | null;
  backgroundImage: ProfileMedia | null;
  galleryImages: ProfileMedia[];
};

export type PublicTechProfile = TechProfileMedia & {
  id: string;
  businessName: string;
  displayName: string;
  bio: string | null;
  phone: string | null;
  email: string | null;
  instagramUrl: string | null;
  bookingEnabled: boolean;
  bookingTimeZone: string | null;
  specialties: string[];
  averageRating: number;
  reviewCount: number;
  publicLocationLabel: string;
  city?: string;
  state?: string;
  country?: string;
  locationVisibility?: "radius_only" | "city_only" | "exact_business_address";
  publicRadiusMiles?: number;
  isSaved?: boolean;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    startingPriceCents: number | null;
    durationMinutes: number | null;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
  }>;
};

export type OwnerTechProfile = PublicTechProfile & {
  isPublished: boolean;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  locationVisibility: "radius_only" | "city_only" | "exact_business_address";
  publicRadiusMiles: number;
  referralCode: string;
};

export type SearchLocation = {
  city: string;
  state: string;
  country: string;
};

export type TechOnboardingForm = {
  businessName: string;
  displayName: string;
  bio: string;
  email: string;
  phone: string;
  instagramUrl: string;
  specialties: string;
  isPublished: boolean;
  referredByCode: string;
};

export const initialTechOnboardingForm: TechOnboardingForm = {
  businessName: "",
  displayName: "",
  bio: "",
  email: "",
  phone: "",
  instagramUrl: "",
  specialties: "",
  isPublished: true,
  referredByCode: ""
};

export type Purchase = {
  planId: string,
  interval: string
};