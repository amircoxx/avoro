import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Artist } from "@/services/api";
import { ArtistCard } from "../beauty-ui";

const artist: Artist = {
  id: 1,
  backendId: "tech-1",
  name: "Gloss Room",
  handle: "Mia",
  type: "Nail Tech",
  specialty: "Gel",
  location: "Atlanta, GA",
  distance: "",
  rating: 0,
  reviewCount: 0,
  priceLabel: "Contact for pricing",
  priceMin: 0,
  tags: [],
  bio: "",
  photo: "/profile.png",
  cover: "",
  gallery: [],
  services: [],
  reviews: [],
  available: true,
  featured: false
};

describe("ArtistCard", () => {
  it("reflects the persisted saved state supplied by search results", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ArtistCard
          artist={artist}
          saved
          isSaving={false}
          onToggleSaved={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(markup).toContain('aria-label="Unsave"');
    expect(markup).toContain("editorial-artist-card");
    expect(markup).toContain("editorial-artist-card__portrait");
    expect(markup).toContain("aspect-[4/3]");
    expect(markup).toContain("editorial-artist-card__body");
    expect(markup).toContain("editorial-artist-card__footer");
    expect(markup).toContain("View profile");
  });

  it("does not render an empty image source for profiles without a photo", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ArtistCard
          artist={{ ...artist, photo: "" }}
          saved={false}
          onToggleSaved={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(markup).not.toContain("<img");
  });
});
