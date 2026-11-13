import { Search, Sparkles } from "lucide-react";
import { ArtistCard } from "@/components/ui/beauty-ui";
import type { Artist } from "@/services/api";
import { EditorialButton } from "@/components/ui/editorial-ui";

export function DiscoverResults({
  artists,
  featuredArtists,
  isFeaturedView,
  isLoadingFeatured,
  location,
  status,
  sort,
  onSortChange,
  savedTechIds,
  savingTechId,
  onToggleSaved,
  onClearFilters
}: {
  artists: Artist[];
  featuredArtists: Artist[];
  isFeaturedView: boolean;
  isLoadingFeatured: boolean;
  location: string;
  status: string;
  sort: string;
  onSortChange: (value: string) => void;
  savedTechIds: Set<string>;
  savingTechId: string | null;
  onToggleSaved: (artist: Artist) => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="editorial-results min-w-0 flex-1">
      {!isFeaturedView ? (
        <div className="editorial-results__header mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{artists.length}</span>{" "}
            artist{artists.length === 1 ? "" : "s"} found
            {location ? ` near ${location}` : null}
            {status ? <span className="ml-2 text-rose-600">{status}</span> : null}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value)}
              className="editorial-control cursor-pointer border border-border bg-white px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary/50"
            >
              <option value="rating">Top Rated</option>
              <option value="distance">Nearest First</option>
              <option value="price">Price: Low → High</option>
              <option value="reviews">Most Reviews</option>
            </select>
          </div>
        </div>
      ) : null}
      {isFeaturedView && isLoadingFeatured ? (
        <div className="editorial-results__grid grid gap-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="editorial-artist-card overflow-hidden border border-border bg-white"
            >
              <div className="aspect-[4/3] animate-pulse bg-muted" />
              <div className="space-y-3 p-4">
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : artists.length > 0 ? (
        <div className="editorial-results__grid grid gap-5">
          {artists.map((artist) => (
            <ArtistCard
              key={`${artist.id}-${artist.backendId ?? "static"}`}
              artist={artist}
              saved={artist.backendId ? savedTechIds.has(artist.backendId) : false}
              isSaving={savingTechId === artist.backendId}
              onToggleSaved={() => onToggleSaved(artist)}
            />
          ))}
        </div>
      ) : (
        <div className="editorial-empty-state border border-border bg-white px-6 py-16 text-center">
          {isFeaturedView ? (
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-rose-300" />
          ) : (
            <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-30" />
          )}
          <p className="font-medium text-foreground">
            {isFeaturedView
              ? featuredArtists.length > 0
                ? "No featured techs match your filters."
                : "Featured techs are coming soon."
              : `No artists found${location ? ` near ${location}` : ""}.`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFeaturedView
              ? featuredArtists.length > 0
                ? "Try clearing your service, price, or search filters."
                : "Enter your city above to search for available artists."
              : "Try another city or remove one of your filters."}
          </p>
          {featuredArtists.length > 0 || !isFeaturedView ? (
            <EditorialButton
              type="button"
              onClick={onClearFilters}
              variant="secondary"
              className="mt-5"
            >
              Clear filters
            </EditorialButton>
          ) : null}
        </div>
      )}
    </div>
  );
}
