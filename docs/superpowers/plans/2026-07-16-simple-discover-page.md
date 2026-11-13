# Simple Discover Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Discover a centered, minimal search-first page with featured or fetched artist cards directly beneath one unified search bar.

**Architecture:** Keep the existing Discover state, facade calls, `DiscoverSearch`, `DiscoverFilters`, and `DiscoverResults` boundaries. Change only the page composition and its scoped CSS, then add structural regression coverage so the data and interaction contracts remain untouched.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, happy-dom, shared CSS tokens, Playwright CLI for browser inspection.

## Global Constraints

- Preserve the current featured-artist and location-search data flows.
- Keep service or artist and city as distinct inputs inside one shared visual search container.
- Keep price filters, fetched-result sorting, saved-tech controls, loading, empty, and error states.
- Render featured cards directly after search with no featured heading, description, or count.
- Preserve Muse paper, ivory, ink, stone, and taupe tokens and the existing typography.
- Preserve explicit accessible labels, keyboard focus, filter-modal semantics, Escape dismissal, and focus return.
- Do not commit implementation files automatically because the same Discover files contain pre-existing uncommitted user work; keep the final diff reviewable instead.

---

### Task 1: Lock the simplified page structure with a regression test

**Files:**
- Modify: `frontend/src/pages/__tests__/discover-page.test.ts`
- Test: `frontend/src/pages/__tests__/discover-page.test.ts`

**Interfaces:**
- Consumes: `DiscoverPage` and the existing mocked `loadFeaturedArtists()` facade.
- Produces: A DOM contract for `.editorial-discover-hero`, `.editorial-discover-search`, and `.editorial-discover-layout` ordering.

- [ ] **Step 1: Write the failing structure test**

Add this test inside `describe("DiscoverPage", ...)`:

```tsx
it("centers one unified search hero before featured cards", async () => {
  loadDiscoverSession.mockResolvedValue({ user: null, savedTechIds: new Set() });
  loadFeaturedArtists.mockResolvedValue([artist("featured", 55, "tech-1")]);
  const view = await renderPage();

  await waitFor(() => expect(view.container.textContent).toContain("featured"));

  const hero = view.container.querySelector(".editorial-discover-hero");
  const search = hero?.querySelector(".editorial-discover-search");
  const results = view.container.querySelector(".editorial-discover-layout");

  expect(hero?.querySelector("h1")?.textContent).toBe("Find your artist.");
  expect(search?.querySelector('input[aria-label="Search services or artists"]')).not.toBeNull();
  expect(search?.querySelector('input[aria-label="Search by city"]')).not.toBeNull();
  expect(search?.querySelector('button[aria-label="Search artists"]')).not.toBeNull();
  expect(hero?.compareDocumentPosition(results as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  view.cleanup();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm --prefix frontend test -- --run src/pages/__tests__/discover-page.test.ts
```

Expected: FAIL because `.editorial-discover-hero` does not exist yet.

- [ ] **Step 3: Confirm the failure is specific**

Confirm the failure points only to the missing simplified hero contract, not a mock or environment error.

---

### Task 2: Compose the centered search-first Discover page

**Files:**
- Modify: `frontend/src/pages/discover-page.tsx`
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/pages/__tests__/discover-page.test.ts`

**Interfaces:**
- Consumes: Existing `DiscoverSearch` props and the existing `DiscoverResults` data contract.
- Produces: `.editorial-discover-hero` containing the heading, supporting copy, and unified search controls; `.editorial-discover-layout` immediately following it.

- [ ] **Step 1: Replace the generic page intro with focused hero markup**

Remove the `EditorialPageIntro` import from `discover-page.tsx`. Replace the current intro and separate search-band markup with:

```tsx
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
      onSearch={() => void searchBackend()}
      onOpenFilters={() => setIsFilterOpen(true)}
    />
  </div>
</section>
```

Do not alter state, effects, filtering, facade calls, modal wiring, or `DiscoverResults` props.

- [ ] **Step 2: Replace the full-width search band CSS with centered hero CSS**

Use these scoped rules as the base, deriving all colors from existing tokens:

```css
.editorial-discover-hero {
  display: grid;
  justify-items: center;
  gap: 32px;
  padding: clamp(64px, 9vw, 112px) 28px 42px;
  text-align: center;
}

.editorial-discover-hero__copy {
  display: grid;
  gap: 12px;
  max-width: 660px;
}

.editorial-discover-hero h1 {
  color: var(--editorial-ink);
  font-family: var(--font-display);
  font-size: clamp(3rem, 7vw, 5.6rem);
  font-weight: 400;
  letter-spacing: -0.055em;
  line-height: 0.92;
}

.editorial-discover-hero__copy p {
  color: var(--editorial-taupe);
  font-size: 0.95rem;
}

.editorial-discover-search {
  width: min(100%, 960px);
}

.editorial-discover-search__inner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
```

Retain the existing shared rail, filter trigger, autocomplete list, focus, modal, and mobile rules. Remove obsolete border-bottom and ivory-band declarations from `.editorial-discover-search`.

- [ ] **Step 3: Tighten the results transition**

Update `.editorial-discover-layout` so cards read as the next part of the same composition:

```css
.editorial-discover-layout {
  align-items: flex-start;
  padding-top: 24px;
  padding-bottom: 80px;
}
```

Keep the existing maximum width and horizontal padding utilities in `discover-page.tsx`.

- [ ] **Step 4: Make the hero and unified rail precise on mobile**

Inside the existing `@media (max-width: 700px)` section, add:

```css
.editorial-discover-hero {
  gap: 24px;
  padding: 48px 16px 24px;
}

.editorial-discover-hero__copy {
  gap: 10px;
}

.editorial-discover-search {
  width: 100%;
}
```

Retain the existing mobile grid treatment for `.editorial-search-rail`, its full-width divider, and the stacked location field. Keep the existing 54-pixel filter trigger and the autocomplete list width of `min(360px, 80vw)` so controls remain reachable without viewport overflow.

- [ ] **Step 5: Run focused tests and verify they pass**

Run:

```bash
npm --prefix frontend test -- --run src/pages/__tests__/discover-page.test.ts src/pages/discover/__tests__/discover-filters.test.tsx
```

Expected: all Discover page and filter tests PASS.

---

### Task 3: Compact the direct-to-grid results and verify the page

**Files:**
- Verify: `frontend/src/pages/discover-page.tsx`
- Verify: `frontend/src/pages/discover/discover-search.tsx`
- Verify: `frontend/src/pages/discover/discover-results.tsx`
- Modify: `frontend/src/components/ui/beauty-ui.tsx`
- Verify: `frontend/src/assets/globals.css`

**Interfaces:**
- Consumes: The complete Discover route and the local frontend development server.
- Produces: A heading-free featured grid with up to three centered columns, compact 4:3 artist cards, and test, type, build, diff, and browser evidence.

- [ ] **Step 1: Run the complete frontend verification set**

Run:

```bash
npm --prefix frontend test -- --run
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

Expected: tests PASS, typecheck exits 0, build exits 0, and `git diff --check` prints no errors.

- [ ] **Step 2: Inspect desktop and mobile in a real browser**

At approximately 1440 by 1000 and 390 by 844 pixels, verify the centered heading, one unified search container, cards directly beneath it, unclipped autocomplete, comfortable touch targets, one-column mobile cards, and no horizontal overflow.

- [ ] **Step 3: Exercise the real interaction paths**

Verify keyword filtering, location selection and submission, filter modal open/apply/close/Escape, fetched-result sorting, save/unsave, and Clear filters. Confirm featured cards are replaced by fetched cards after a location search.

- [ ] **Step 4: Review only the task-owned diff**

Run:

```bash
git diff -- frontend/src/pages/discover-page.tsx frontend/src/pages/__tests__/discover-page.test.ts frontend/src/assets/globals.css
```

Expected: the diff contains only the approved structural test, centered hero composition, and scoped responsive CSS layered over the pre-existing Discover work.
