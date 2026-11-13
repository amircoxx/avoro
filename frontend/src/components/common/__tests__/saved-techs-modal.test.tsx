import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedTechsList, SavedTechsModal } from "../saved-techs-modal";

describe("SavedTechsModal", () => {
  it("uses Saved techs as the only header copy", () => {
    const markup = renderToStaticMarkup(
      <SavedTechsModal
        onClose={() => undefined}
        onDiscover={() => undefined}
        onOpenProfile={() => undefined}
      />
    );

    expect(markup).toContain("Saved techs");
    expect(markup).not.toContain("Your shortlist");
  });
});

describe("SavedTechsList", () => {
  it("shows each saved tech with profile and remove actions", () => {
    const markup = renderToStaticMarkup(
      <SavedTechsList
        techs={[{
          id: "tech-1",
          businessName: "Gloss Room",
          displayName: "Mia",
          bio: null,
          phone: null,
          email: null,
          instagramUrl: null,
          bookingEnabled: false,
          bookingTimeZone: null,
          specialties: ["Gel-X"],
          averageRating: 5,
          reviewCount: 12,
          publicLocationLabel: "Charlotte, NC",
          services: [],
          profileImage: { id: "profile", imageUrl: "profile.jpg", altText: null, sortOrder: 0 },
          backgroundImage: null,
          galleryImages: [],
          reviews: []
        }]}
        onOpenProfile={() => undefined}
        onRemove={() => undefined}
        removingId={null}
      />
    );

    expect(markup).toContain("Gloss Room");
    expect(markup).toContain('src="profile.jpg"');
    expect(markup).toContain("View profile");
    expect(markup).toContain("bg-[var(--editorial-ink)]");
    expect(markup).toContain("text-[var(--editorial-paper)]");
    expect(markup).toContain('aria-label="Remove Gloss Room"');
  });
});
