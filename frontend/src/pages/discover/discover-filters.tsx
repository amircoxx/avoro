import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PriceRangeFilter } from "@/utils/marketplace";

const priceRangeOptions: Array<{ label: string; value: PriceRangeFilter }> = [
  { label: "Under $60", value: "under-60" },
  { label: "$60 – $100", value: "60-100" },
  { label: "$100 – $150", value: "100-150" },
  { label: "$150+", value: "150-plus" }
];

export function DiscoverFilters({
  isOpen,
  selectedPriceRanges,
  onApply,
  onClose
}: {
  isOpen: boolean;
  selectedPriceRanges: PriceRangeFilter[];
  onApply: (ranges: PriceRangeFilter[]) => void;
  onClose: () => void;
}) {
  const [draftRanges, setDraftRanges] = useState<PriceRangeFilter[]>(selectedPriceRanges);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraftRanges(selectedPriceRanges);
    closeButtonRef.current?.focus();
  }, [isOpen, selectedPriceRanges]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function toggleRange(range: PriceRangeFilter) {
    setDraftRanges((current) => current.includes(range)
      ? current.filter((selectedRange) => selectedRange !== range)
      : [...current, range]);
  }

  return (
    <div className="editorial-filter-modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className="editorial-filter-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-filter-title"
      >
        <header className="editorial-filter-modal__header">
          <div>
            <p className="editorial-kicker">Refine the directory</p>
            <h2 id="discover-filter-title">Filter</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close filters" className="editorial-filter-modal__close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="editorial-filter-modal__section">
          <p className="editorial-filter-modal__label">Price range</p>
          <div className="editorial-filter-modal__chips" aria-label="Price range filters">
            {priceRangeOptions.map((range) => {
              const isSelected = draftRanges.includes(range.value);
              return (
                <button
                  key={range.value}
                  type="button"
                  className="editorial-filter-chip"
                  aria-pressed={isSelected}
                  onClick={() => toggleRange(range.value)}
                >
                  {range.label}
                </button>
              );
            })}
          </div>
        </div>

        <footer className="editorial-filter-modal__footer">
          <button type="button" className="editorial-filter-modal__clear" onClick={() => setDraftRanges([])}>Clear</button>
          <button type="button" className="editorial-filter-modal__apply" onClick={() => onApply(draftRanges)}>Apply filters</button>
        </footer>
      </section>
    </div>
  );
}
