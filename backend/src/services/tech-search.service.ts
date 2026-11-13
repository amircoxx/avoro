/** Queries published tech profiles for city search and featured discovery results. */
import { prisma } from "../models/database.model";
import type { SearchQuery } from "../validations/search.schema";
import { profileInclude, publicCoordinate, toPublicTechProfile } from "./shared/marketplace";

export async function searchTechsByCity(query: SearchQuery) {
  const profiles = await prisma.techProfile.findMany({
    where: {
      isPublished: true,
      location: {
        is: {
          city: { equals: query.city, mode: "insensitive" },
          ...(query.state ? { state: { equals: query.state, mode: "insensitive" } } : {}),
          country: { equals: query.country, mode: "insensitive" }
        }
      }
    },
    include: profileInclude,
    orderBy: [{ averageRating: "desc" }, { reviewCount: "desc" }, { createdAt: "desc" }],
    skip: query.offset,
    take: query.limit
  });

  return profiles
    .map((profile) => {
      const location = profile.location;
      if (!location) return null;

      return {
        ...toPublicTechProfile(profile),
        publicLat: publicCoordinate(location.latitude, location.locationVisibility),
        publicLng: publicCoordinate(location.longitude, location.locationVisibility)
      };
    })
    .filter((profile): profile is NonNullable<typeof profile> => profile !== null);
}

export async function getFeaturedTechs(limit: number) {
  const profiles = await prisma.techProfile.findMany({
    where: { isPublished: true, reviewCount: { gt: 0 } },
    include: profileInclude,
    orderBy: [{ reviewCount: "desc" }, { averageRating: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  return profiles.map(toPublicTechProfile);
}
