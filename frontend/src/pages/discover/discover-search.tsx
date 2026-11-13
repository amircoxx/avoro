import type { FormEvent, RefObject } from "react";
import { LocateFixed, MapPin, Search, SlidersHorizontal } from "lucide-react";
import LocationAutocomplete from "@/components/common/location-autocomplete";
import type { LocationSuggestion } from "@/services/api";

export function DiscoverSearch({
  query,
  location,
  activeFilterCount,
  filterTriggerRef,
  onQueryChange,
  onLocationSelect,
  onLocationClear,
  onUseCurrentLocation,
  onSearch,
  onOpenFilters
}: {
  query: string;
  location: string;
  activeFilterCount: number;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  onQueryChange: (query: string) => void;
  onLocationSelect: (suggestion: LocationSuggestion) => void;
  onLocationClear: () => void;
  onUseCurrentLocation?: () => void;
  onSearch: () => void;
  onOpenFilters: () => void;
}) {
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  const filterLabel = activeFilterCount > 0
    ? `Open price filters, ${activeFilterCount} active`
    : "Open price filters";

  return (
    <div className="editorial-discover-search__inner">
      <form className="editorial-search-rail" onSubmit={submitSearch}>
        <button type="submit" className="editorial-search-rail__submit" aria-label="Search artists">
          <Search aria-hidden="true" />
        </button>

        <div className="editorial-search-rail__field editorial-search-rail__field--query">
          <input
            aria-label="Search services or artists"
            placeholder="What are you searching for?"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>

        <span className="editorial-search-rail__divider" aria-hidden="true" />

        <div className="editorial-search-rail__field editorial-search-rail__field--location">
          <MapPin aria-hidden="true" />
          <LocationAutocomplete
            ariaLabel="Search by city"
            placeholder="City or service area"
            selectedLabel={location}
            className="editorial-search-rail__autocomplete"
            inputClassName="editorial-search-rail__location-input"
            onSelect={onLocationSelect}
            onClear={onLocationClear}
          />
          <button
            type="button"
            className="editorial-search-rail__location-action"
            aria-label="Use my location"
            title="Use my location"
            onClick={onUseCurrentLocation}
          >
            <LocateFixed aria-hidden="true" />
          </button>
        </div>
      </form>

      <button
        ref={filterTriggerRef}
        type="button"
        className="editorial-filter-trigger"
        aria-label={filterLabel}
        onClick={onOpenFilters}
      >
        <SlidersHorizontal aria-hidden="true" />
        {activeFilterCount > 0 ? <span className="editorial-filter-trigger__count" aria-hidden="true">{activeFilterCount}</span> : null}
      </button>
    </div>
  );
}
