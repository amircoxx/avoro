import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type PortfolioRailImage = {
  id: string;
  src: string;
  alt: string;
};

export function PortfolioRail({
  images,
  className = "",
  renderOverlay,
  trailingItem
}: {
  images: PortfolioRailImage[];
  className?: string;
  renderOverlay?: (image: PortfolioRailImage, index: number) => ReactNode;
  trailingItem?: ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedImage = selectedIndex === null ? null : images[selectedIndex];

  useEffect(() => {
    if (!selectedImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedIndex(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [selectedImage]);

  function openImage(index: number, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedIndex(index);
  }

  function scrollRail(direction: -1 | 1) {
    railRef.current?.scrollBy({ left: direction * 440, behavior: "smooth" });
  }

  return (
    <div className={`editorial-portfolio-rail-wrap ${className}`.trim()}>
      <div className="editorial-portfolio-rail__controls" aria-label="Portfolio navigation">
        <button type="button" aria-label="Previous portfolio photos" onClick={() => scrollRail(-1)}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <button type="button" aria-label="Next portfolio photos" onClick={() => scrollRail(1)}>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <div ref={railRef} className="editorial-portfolio-rail" aria-label="Portfolio photos">
        {images.map((image, index) => (
          <div key={image.id} className="editorial-portfolio-rail__card group relative">
            <button
              type="button"
              aria-label={`View portfolio photo ${index + 1}`}
              className="editorial-portfolio-rail__image"
              onClick={(event) => openImage(index, event.currentTarget)}
            >
              <img src={image.src} alt={image.alt} />
              <span>View</span>
            </button>
            {renderOverlay?.(image, index)}
          </div>
        ))}
        {trailingItem}
      </div>

      {selectedImage ? createPortal(
        <div
          className="editorial-portfolio-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Portfolio photo viewer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedIndex(null);
          }}
        >
          <button ref={closeRef} type="button" aria-label="Close portfolio photo" onClick={() => setSelectedIndex(null)}>
            <X aria-hidden="true" />
          </button>
          <figure>
            <img src={selectedImage.src} alt={`${selectedImage.alt}, enlarged`} />
            <figcaption>{selectedIndex! + 1} / {images.length}</figcaption>
          </figure>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
