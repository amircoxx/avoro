/** Pure filtering contracts and helpers for marketplace result collections. */
export type SearchableTech = {
  businessName: string;
  displayName: string;
  bio: string | null;
  specialties: string[];
  services: Array<{
    name: string;
    description?: string | null;
  }>;
};

export type PriceRangeFilter = "under-60" | "60-100" | "100-150" | "150-plus";

type PricedArtist = {
  priceMin: number;
};

export function filterTechsByQuery<TTech extends SearchableTech>(techs: TTech[], query: string): TTech[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return techs;

  return techs.filter((tech) => {
    const searchableText = [
      tech.businessName,
      tech.displayName,
      tech.bio ?? "",
      ...tech.specialties,
      ...tech.services.flatMap((service) => [service.name, service.description ?? ""])
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function filterArtistsByPriceRanges<TArtist extends PricedArtist>(
  artists: TArtist[],
  selectedRanges: PriceRangeFilter[]
): TArtist[] {
  if (selectedRanges.length === 0) return artists;

  const ranges = new Set(selectedRanges);

  return artists.filter((artist) => {
    const price = artist.priceMin;

    return (
      (ranges.has("under-60") && price < 60) ||
      (ranges.has("60-100") && price >= 60 && price <= 100) ||
      (ranges.has("100-150") && price >= 100 && price <= 150) ||
      (ranges.has("150-plus") && price >= 150)
    );
  });
}
