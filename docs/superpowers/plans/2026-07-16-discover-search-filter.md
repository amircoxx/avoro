# Discover Search and Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Discover page's separate search controls and permanent price sidebar with a themed search rail and accessible price-filter modal while preserving location autocomplete and result behavior.

**Architecture:** `DiscoverPageContent` continues to own search and applied-filter state. A focused `DiscoverSearch` component renders keyword and location controls, while `DiscoverFilters` becomes a controlled modal with private draft state that only commits through `onApply`.

**Tech Stack:** React 19, TypeScript 5.8, Lucide React, Tailwind 4 utilities, project editorial CSS, Vitest, Happy DOM.

## Global Constraints

- Preserve keyword filtering, URL-derived initial values, location selection and clearing, backend location search, status messaging, and result behavior.
- Keep all existing four price ranges and allow multiple selections.
- Closing the modal without Apply must discard draft changes.
- Support close button, backdrop click, and Escape dismissal.
- Preserve visible keyboard focus and mobile layouts.
- Add no dependencies.

---

### Task 1: Controlled price-filter modal

**Files:**
- Modify: `frontend/src/pages/discover/discover-filters.tsx`
- Create: `frontend/src/pages/discover/__tests__/discover-filters.test.tsx`

**Interfaces:**
- Consumes: `PriceRangeFilter[]` from `@/utils/marketplace`.
- Produces: `DiscoverFilters({ isOpen, selectedPriceRanges, onApply, onClose }): JSX.Element | null`.

- [ ] **Step 1: Write the failing modal behavior tests**

Create tests that render the component with `isOpen: true`, click `Under $60` and `$100 – $150`, click `Apply filters`, and assert `onApply(["under-60", "100-150"])`. Add cases asserting the close button and Escape call `onClose` without calling `onApply`, and that Clear followed by Apply returns `[]`.

```tsx
const onApply = vi.fn();
const view = renderFilters({ isOpen: true, selectedPriceRanges: [], onApply, onClose: vi.fn() });
await act(async () => chip(view.container, "Under $60")?.click());
await act(async () => chip(view.container, "$100 – $150")?.click());
await act(async () => button(view.container, "Apply filters")?.click());
expect(onApply).toHaveBeenCalledWith(["under-60", "100-150"]);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm --prefix frontend test -- src/pages/discover/__tests__/discover-filters.test.tsx`

Expected: FAIL because the existing sidebar does not accept modal props or render modal actions.

- [ ] **Step 3: Implement controlled draft behavior and dialog accessibility**

Update the component to accept:

```tsx
type DiscoverFiltersProps = {
  isOpen: boolean;
  selectedPriceRanges: PriceRangeFilter[];
  onApply: (ranges: PriceRangeFilter[]) => void;
  onClose: () => void;
};
```

Synchronize a `draftRanges` state from `selectedPriceRanges` each time the modal opens. Add Escape handling and body scroll locking in effects. Return `null` when closed. Render a backdrop with a `role="dialog"`, `aria-modal="true"`, `aria-labelledby="discover-filter-title"`, a close button labeled `Close filters`, selectable chip buttons using `aria-pressed`, and Clear/Apply actions. Stop click propagation on the dialog panel so only backdrop clicks dismiss it.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm --prefix frontend test -- src/pages/discover/__tests__/discover-filters.test.tsx`

Expected: PASS.

---

### Task 2: Search rail and Discover page integration

**Files:**
- Create: `frontend/src/pages/discover/discover-search.tsx`
- Modify: `frontend/src/pages/discover-page.tsx`
- Modify: `frontend/src/pages/__tests__/discover-page.test.ts`

**Interfaces:**
- Consumes: `LocationSuggestion`, `SearchLocation`, and the existing `LocationAutocomplete` contract.
- Produces: `DiscoverSearch({ query, location, activeFilterCount, onQueryChange, onLocationSelect, onLocationClear, onSearch, onOpenFilters }): JSX.Element`.
- Consumes from Task 1: controlled `DiscoverFilters` props.

- [ ] **Step 1: Extend the Discover page test with the new controls**

Make the location mock render its placeholder, then assert the page contains `input[aria-label="Search services or artists"]`, the location placeholder, `button[aria-label="Search artists"]`, and `button[aria-label="Open price filters"]`. Click the filter trigger and assert `[role="dialog"]` appears; apply two chips and assert the trigger label becomes `Open price filters, 2 active`.

```tsx
expect(view.container.querySelector('input[aria-label="Search services or artists"]')).not.toBeNull();
expect(buttonWithLabel(view.container, "Search artists")).not.toBeNull();
await act(async () => buttonWithLabel(view.container, "Open price filters")?.click());
expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
```

- [ ] **Step 2: Run the Discover page test and verify it fails**

Run: `npm --prefix frontend test -- src/pages/__tests__/discover-page.test.ts`

Expected: FAIL because the consolidated search and modal trigger are not rendered.

- [ ] **Step 3: Create the focused search component**

Render a semantic form containing a keyword field, a desktop divider, the existing location autocomplete, and an icon submit button. Render the circular sliders trigger as a sibling button and show an active-count badge when `activeFilterCount > 0`. Submit through `onSearch`, retain the autocomplete callbacks, and use explicit accessible labels.

- [ ] **Step 4: Integrate search and modal state in the page**

Add `isFilterOpen` state to `DiscoverPageContent`. Replace the existing search-control markup and sidebar with `DiscoverSearch` followed by `DiscoverFilters`. Pass `setSelectedPriceRanges` through `onApply` and close the modal after applying. Remove the old `togglePriceRange` function and keep `DiscoverResults` unchanged.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `npm --prefix frontend test -- src/pages/__tests__/discover-page.test.ts src/pages/discover/__tests__/discover-filters.test.tsx`

Expected: PASS.

---

### Task 3: Editorial styling and full verification

**Files:**
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Consumes: class names rendered by `DiscoverSearch` and `DiscoverFilters`.
- Produces: responsive desktop/mobile layout, themed modal, filter chips, focus states, and active badge.

- [ ] **Step 1: Add the reference-led editorial styles**

Style `.editorial-discover-search__inner` as a constrained horizontal row; `.editorial-search-rail` as a paper pill with stone border; `.editorial-search-rail__field` as flexible keyword/location segments; and `.editorial-filter-trigger` as a circular control. Style the modal backdrop, panel, close control, price section, chips, footer actions, and count badge using only the existing editorial tokens. Add `:focus-visible` outlines and a mobile breakpoint that stacks the rail fields, removes the desktop divider, and keeps the trigger aligned with the rail.

- [ ] **Step 2: Run all frontend tests**

Run: `npm --prefix frontend test`

Expected: all tests pass.

- [ ] **Step 3: Run static and production checks**

Run: `npm --prefix frontend run typecheck`

Expected: exit code 0.

Run: `npm --prefix frontend run build`

Expected: exit code 0 and Vite production assets generated.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Verify in a browser**

Start the frontend with `npm --prefix frontend run dev -- --host 127.0.0.1`, open the Discover page, and inspect desktop and mobile widths. Confirm keyword entry, city autocomplete visibility, search submission, filter open/close, multi-select, Apply, Clear, backdrop dismissal, Escape dismissal, active count, and background scroll locking.
