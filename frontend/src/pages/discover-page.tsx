/** Marketplace search screen with city filters, featured results, and saved-tech controls. */
"use client";

import { useSearchParams } from "@/hooks/router";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { LocationSuggestion } from "@/services/api";
import { type SearchLocation } from "@/services/api";
import { getLocationFromCoords } from "@/services/api";
import { loadSavedTechIds, loadFeaturedArtists, searchArtists, toggleSavedTech } from "@/facades/discover.facade";
import { filterArtistsByPriceRanges, type PriceRangeFilter } from "@/utils/marketplace";
import { type Artist } from "@/services/api";
import { useAccountAuth } from "@/context/account-auth-context";
import { DiscoverFilters } from "./discover/discover-filters";
import { DiscoverSearch } from "./discover/discover-search";
import { parseTypedLocation } from "./discover/discover-location";
import { DiscoverResults } from "./discover/discover-results";

const FEATURED_TECH_LIMIT = 6;

function DiscoverPageContent() {
  const searchParams = useSearchParams();
  const { authUser: currentUser, isAuthLoading } = useAccountAuth();
  const [sort, setSort] = useState("rating");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [location, setLocation] = useState(searchParams.get("location") ?? "");
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<PriceRangeFilter[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [selectedLocation, setSelectedLocation] = useState<SearchLocation | null>(() => {
    const city = searchParams.get("city");
    if (!city) return null;
    return {
      city,
      state: searchParams.get("state") ?? "",
      country: searchParams.get("country") ?? "US"
    };
  });
  const [featuredArtists, setFeaturedArtists] = useState<Artist[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(true);
  const [backendArtists, setBackendArtists] = useState<Artist[] | null>(null);
  const [status, setStatus] = useState("");
  const [savedTechIds, setSavedTechIds] = useState<Set<string>>(() => new Set());
  const [savingTechId, setSavingTechId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (isAuthLoading) return () => { isMounted = false; };
    if (currentUser?.role !== "CUSTOMER") {
      setSavedTechIds(new Set());
      return () => { isMounted = false; };
    }
    void loadSavedTechIds(currentUser).then((savedTechIds) => {
      if (isMounted) setSavedTechIds(savedTechIds);
    });
    return () => {
      isMounted = false;
    };
  }, [currentUser, isAuthLoading]);

  useEffect(() => {
    let isMounted = true;

    async function loadFeaturedTechs() {
      setIsLoadingFeatured(true);

      try {
        const artists = await loadFeaturedArtists(FEATURED_TECH_LIMIT);

        if (!isMounted) return;

        setFeaturedArtists(artists);
      } catch (error) {
        console.error("Failed to load featured techs:", error);

        if (isMounted) {
          setFeaturedArtists([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingFeatured(false);
        }
      }
    }

    void loadFeaturedTechs();

    return () => {
      isMounted = false;
    };
  }, []);

  async function searchBackend(locationOverride?: SearchLocation) {
    const searchLocation = locationOverride ?? selectedLocation ?? parseTypedLocation(location);
    if (!searchLocation) {
      setBackendArtists(null);
      setStatus("");
      return;
    }

    setStatus("Searching...");

    try {
      setBackendArtists(await searchArtists(searchLocation));
      setStatus("");
    } catch (error) {
      setBackendArtists([]);
      setStatus(error instanceof Error ? error.message : "Search failed");
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Unable to fetch your current location.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const resolvedLocation = await getLocationFromCoords(
            position.coords.latitude,
            position.coords.longitude
          );

          if (!resolvedLocation) {
            toast.error("Unable to determine your current city.");
            return;
          }

          const nextLocation: SearchLocation = {
            city: resolvedLocation.city ?? resolvedLocation.label,
            state: resolvedLocation.state ?? "",
            country: resolvedLocation.country ?? "US"
          };

          setLocation(resolvedLocation.label);
          setSelectedLocation(nextLocation);
          await searchBackend(nextLocation);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to fetch your current location."
          );
        }
      },
      () => {
        toast.error("Unable to fetch your current location.");
      }
    );
  }

  useEffect(() => {
    if (selectedLocation) {
      void searchBackend();
    }
  }, []);

  const isFeaturedView = backendArtists === null;

  const artists = isFeaturedView
    ? featuredArtists
    : backendArtists;
  function closeFilters() {
    setIsFilterOpen(false);
    window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
  }

  async function toggleSavedArtist(artist: Artist) {
    if (!artist.backendId) return;

    if (!currentUser) {
      toast.error("Log in as a customer to save techs.");
      return;
    }
    if (currentUser.role !== "CUSTOMER") {
      toast.error("Only customer accounts can save techs.");
      return;
    }

    const techId = artist.backendId;
    const wasSaved = savedTechIds.has(techId);
    setSavingTechId(techId);
    try {
      const result = await toggleSavedTech(techId, wasSaved);
      setSavedTechIds((current) => {
        const next = new Set(current);
        if (result.saved) next.add(techId);
        else next.delete(techId);
        return next;
      });
      toast.success(result.saved ? `${artist.name} saved!` : `Removed ${artist.name} from saved techs.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saved tech could not be updated");
    } finally {
      setSavingTechId(null);
    }
  }

  const filtered = useMemo(() => {
    const matchingArtists = filterArtistsByPriceRanges(
      artists,
      selectedPriceRanges
    ).filter((artist) => {
      if (query.trim()) {
        const normalizedQuery = query.trim().toLowerCase();

        const matchesName = artist.name
          .toLowerCase()
          .includes(normalizedQuery);

        const matchesSpecialty = artist.specialty
          .toLowerCase()
          .includes(normalizedQuery);

        const matchesTag = artist.tags.some((tag) =>
          tag.toLowerCase().includes(normalizedQuery)
        );

        if (!matchesName && !matchesSpecialty && !matchesTag) {
          return false;
        }
      }

      return true;
    });

    if (isFeaturedView) {
      return matchingArtists;
    }

    return matchingArtists.sort((a, b) => {
      if (sort === "rating") {
        return (
          b.rating - a.rating ||
          b.reviewCount - a.reviewCount
        );
      }

      if (sort === "distance") {
        return parseFloat(a.distance) - parseFloat(b.distance);
      }

      if (sort === "price") {
        return a.priceMin - b.priceMin;
      }

      return b.reviewCount - a.reviewCount;
    });
  }, [
    artists,
    isFeaturedView,
    query,
    selectedPriceRanges,
    sort
  ]);


  return (
    <div className="editorial-page editorial-discover min-h-screen">
      <section className="editorial-discover-hero" aria-labelledby="discover-title">
        <div className="editorial-discover-hero__copy">
          <h1 id="discover-title">Find your artist.</h1>
          <p>Search independent nail and lash professionals near you.</p>
        </div>

        <div className="editorial-discover-search">
          <DiscoverSearch
            query={query}
            location={location}
            activeFilterCount={selectedPriceRanges.length}
            filterTriggerRef={filterTriggerRef}
            onQueryChange={setQuery}
            onLocationSelect={(suggestion: LocationSuggestion) => {
              setLocation(suggestion.label);
              setSelectedLocation({
                city: suggestion.city || suggestion.label,
                state: suggestion.state || "",
                country: suggestion.country || "US"
              });
            }}
            onLocationClear={() => {
              setLocation("");
              setSelectedLocation(null);
              setBackendArtists(null);
              setStatus("");
            }}
            onUseCurrentLocation={useCurrentLocation}
            onSearch={() => void searchBackend()}
            onOpenFilters={() => setIsFilterOpen(true)}
          />
        </div>
      </section>

      <DiscoverFilters
        isOpen={isFilterOpen}
        selectedPriceRanges={selectedPriceRanges}
        onApply={(ranges) => {
          setSelectedPriceRanges(ranges);
          closeFilters();
        }}
        onClose={closeFilters}
      />

      <div className="editorial-discover-layout max-w-7xl mx-auto px-5 py-8">
        <DiscoverResults
          artists={filtered}
          featuredArtists={featuredArtists}
          isFeaturedView={isFeaturedView}
          isLoadingFeatured={isLoadingFeatured}
          location={location}
          status={status}
          sort={sort}
          onSortChange={setSort}
          savedTechIds={savedTechIds}
          savingTechId={savingTechId}
          onToggleSaved={(artist) => void toggleSavedArtist(artist)}
          onClearFilters={() => {
            setQuery("");
            setSelectedPriceRanges([]);
          }}
        />
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="editorial-page editorial-discover min-h-screen" />}>
      <DiscoverPageContent />
    </Suspense>
  );
}
