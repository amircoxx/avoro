# Simple Discover Page Design

## Goal

Simplify the Discover page so the search experience is the visual focus and featured or fetched artist cards appear directly beneath it. Preserve the current marketplace data, filtering, saving, sorting, and location-search behavior.

## Page structure

- Keep the existing site header and footer.
- Replace the large editorial page introduction and separated search band with a centered, compact hero.
- Use the existing `Find your artist.` title with one short supporting sentence.
- Place one unified search bar directly below the heading.
- Place the artist-card grid immediately below the search area without a featured heading, count, sidebar, or decorative section break.
- Show the compact result count and sorting controls only after an actual location search.

## Unified search bar

- Keep service or artist and city as distinct inputs inside one shared visual container.
- Separate the inputs with a quiet divider on desktop and stack them within the same container on narrow screens.
- Keep the location autocomplete contract and the existing typed-location fallback.
- Keep the price-filter trigger attached to the search controls, with its active-filter count.
- Keep an explicit Search action so location searches remain intentional and keyboard accessible.
- Use a white paper surface, soft border, restrained shadow, and moderate rounding consistent with the supplied reference and the existing Muse palette.

## Results behavior

- Load and show featured artists beneath the search bar when no location search has run.
- Replace featured artists with fetched location results after a successful search.
- Continue filtering the displayed set by keyword and selected price ranges.
- Keep the fetched-result count, saved-tech controls, loading skeletons, sorting for fetched results, empty states, and error status.
- Use the same responsive artist-card grid for both featured and fetched results.

## Visual direction

- Preserve Muse's paper, ivory, ink, stone, and taupe tokens and current typography.
- Use whitespace and alignment as the primary design tools; remove nonessential kicker copy and heavy section framing.
- Center the hero and constrain it to a comfortable reading width.
- Let the artist imagery provide the page's color and visual energy.
- Use compact editorial artist cards with a 4:3 image and up to three centered columns on wide screens so the grid remains secondary to search. Center incomplete rows instead of leaving one or two cards aligned to the page edge.

## Responsive and accessible behavior

- Keep every input and icon button explicitly labeled.
- Preserve visible keyboard focus, modal semantics, Escape dismissal, focus return, and background scroll locking for filters.
- At mobile widths, stack the two input regions inside the unified search container and keep Search and Filter controls at comfortable touch sizes.
- Avoid horizontal overflow and keep cards in a single column on small screens.

## Error and empty states

- Keep loading skeletons beneath the search bar while featured artists load.
- Show concise status text near the results heading when a search fails.
- Keep the existing actionable empty-state guidance and Clear filters action.

## Verification

- Update focused Discover tests to cover the simplified structure while preserving search, filters, featured results, and fetched results.
- Run the focused Discover tests, frontend typecheck, production build, and whitespace validation.
- Inspect desktop and mobile layouts in a real browser.
- Exercise keyword filtering, city search, price filters, modal close behavior, sorting, saving, and empty states.
