# Cross-Page Editorial System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the landing page's black-and-ivory editorial system across every Muse route and shared page surface without changing marketplace behavior.

**Architecture:** Add small shared editorial presentation primitives and stable `editorial-*` semantic classes while leaving page state, API calls, facades, and route contracts in place. Migrate pages in workflow groups—discovery/customer profile, marketing, owner editor/dialogs—using source/render regression tests before each production change. Finish with route-by-route desktop/mobile browser checks.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Lucide React, Vitest, happy-dom, Playwright CLI.

## Global Constraints

- Reuse `#F5F2EA`, `#FCFBF7`, `#11110F`, `#D8D2C8`, `#817A70`, `--font-display`, and `--font-sans` from the approved landing page.
- Preserve all routes, API contracts, search parameters, authentication, saves, reviews, referral flow, profile drafts, uploads, and modal behavior.
- Remove unsupported `400+` tech and `2,400+` client claims from `/for-techs`.
- Keep semantic status colors only for real success, warning, destructive, or saved state.
- Preserve visible focus, dialog labeling, tab semantics, touch targets, and reduced-motion behavior.
- Do not change backend code, database schema, or customer-facing data fixtures.

---

### Task 1: Establish Shared Editorial Primitives and Route Contracts

**Files:**
- Create: `frontend/src/components/ui/editorial-ui.tsx`
- Create: `frontend/src/__tests__/editorial-surfaces.test.ts`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Produces: `EditorialPageIntro`, `EditorialButton`, `EditorialPanel`, and `EditorialEmptyState` presentation components.
- Produces: shared classes `editorial-page`, `editorial-page-intro`, `editorial-panel`, `editorial-control`, `editorial-tabs`, and `editorial-dialog`.

- [ ] Write a failing source-contract test that reads every route page and expects an `editorial-*` root class, expects shared dialogs to use `editorial-dialog`, and rejects the unsupported `400+` and `2,400+` copy.
- [ ] Run `npm test --workspace @find-my-tech/frontend -- src/__tests__/editorial-surfaces.test.ts` and confirm it fails because the interior routes have not migrated.
- [ ] Create typed primitives that accept normal React children and class names without owning navigation or data.
- [ ] Add shared CSS for page backgrounds, serif intros, square panels, controls, tabs, buttons, statuses, dialogs, and mobile behavior.
- [ ] Add a focused render test for primitive variants and run it green.
- [ ] Commit with `feat: add shared editorial page primitives`.

The primitive signatures are:

```tsx
type EditorialPageIntroProps = {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

type EditorialButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "danger";
};

type EditorialPanelProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "aside" | "div";
};

type EditorialEmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};
```

---

### Task 2: Migrate Discovery and Artist Cards

**Files:**
- Modify: `frontend/src/pages/discover-page.tsx`
- Modify: `frontend/src/pages/discover/discover-filters.tsx`
- Modify: `frontend/src/pages/discover/discover-results.tsx`
- Modify: `frontend/src/components/ui/beauty-ui.tsx`
- Modify: `frontend/src/pages/__tests__/discover-page.test.ts`
- Modify: `frontend/src/components/ui/__tests__/artist-card.test.tsx`

**Interfaces:**
- Preserve: location autocomplete, `searchBackend`, price filtering, sorting, saved-tech behavior, and artist-card callbacks.
- Produce: `editorial-discover`, `editorial-discover-search`, `editorial-filter-index`, `editorial-results`, and `editorial-artist-card` surfaces.

- [ ] Add failing assertions for the editorial discover root, titled results region, square filter index, and editorial artist card.
- [ ] Run the focused Discover and ArtistCard tests and confirm the new assertions fail.
- [ ] Recompose only markup/classes around the existing search and result state.
- [ ] Convert cards from rounded/shadowed pastel cards to ruled paper cards with sharp images and serif names.
- [ ] Run focused tests, typecheck, and build.
- [ ] Commit with `feat: restyle editorial discovery`.

---

### Task 3: Migrate the Public Artist Profile

**Files:**
- Modify: `frontend/src/pages/artist-profile-page.tsx`
- Modify: `frontend/src/pages/artist-profile/profile-contact.tsx`
- Modify: `frontend/src/pages/artist-profile/profile-tabs.tsx`
- Modify: `frontend/src/pages/artist-profile/review-form.tsx`
- Modify: `frontend/src/pages/__tests__/artist-profile-page.test.ts`

**Interfaces:**
- Preserve: profile loading, not-found state, booking/message behavior, save state, contact links, tabs, services, portfolio, and review submission.
- Produce: `editorial-profile`, `editorial-profile-folio`, `editorial-profile-tabs`, `editorial-profile-ledger`, and `editorial-review` surfaces.

- [ ] Add failing render/source assertions for the profile root, serif identity heading, underlined tabs, and editorial not-found action.
- [ ] Run the focused artist-profile test and confirm failure.
- [ ] Restyle the cover, identity folio, metadata, contact ledger, tabs, content panels, portfolio grid, services, and reviews.
- [ ] Keep the avatar and icon-only save control functionally shaped; remove decorative rounding elsewhere.
- [ ] Run focused tests, typecheck, and build.
- [ ] Commit with `feat: restyle editorial artist profiles`.

---

### Task 4: Migrate How It Works and For Techs

**Files:**
- Modify: `frontend/src/pages/how-it-works-page.tsx`
- Modify: `frontend/src/pages/for-techs-page.tsx`
- Modify: `frontend/src/pages/for-techs/marketing-sections.tsx`
- Modify: `frontend/src/pages/for-techs/tech-signup-modal.tsx`
- Modify: `frontend/src/pages/__tests__/for-techs-page.test.ts`

**Interfaces:**
- Preserve: all route CTAs, tech auth/signup, referral reveal, onboarding fields, service-area selection, and profile creation.
- Produce: `editorial-process`, `editorial-for-techs`, `editorial-tech-benefits`, `editorial-comparison`, and `editorial-faq` surfaces.

- [ ] Add failing assertions for editorial route roots, ruled process rows, factual launch terms, and absence of unsupported growth counts.
- [ ] Run ForTechs and editorial source tests and confirm failure.
- [ ] Rebuild How It Works as two four-step process ledgers plus a strong privacy close.
- [ ] Recompose For Techs around the existing form behavior, replace fabricated statistics with factual launch terms, and restyle benefits/comparison/referral/FAQ sections.
- [ ] Restyle the tech signup overlay with `editorial-dialog` while retaining its child content contract.
- [ ] Run focused tests, typecheck, and build.
- [ ] Commit with `feat: restyle editorial marketing pages`.

---

### Task 5: Migrate Owner Profile, Shared Preview, and Dialogs

**Files:**
- Modify: `frontend/src/pages/tech-profile-page.tsx`
- Modify: `frontend/src/pages/tech-profile/tech-profile-editor-header.tsx`
- Modify: `frontend/src/pages/tech-profile/tech-profile-empty-state.tsx`
- Modify: `frontend/src/pages/tech-profile/tech-profile-loading-state.tsx`
- Modify: `frontend/src/components/layout/tech-profile-preview.tsx`
- Modify: `frontend/src/components/layout/tech-profile-details-modal.tsx`
- Modify: `frontend/src/components/layout/account-auth-modal.tsx`
- Modify: `frontend/src/components/layout/account-settings-modal.tsx`
- Modify: `frontend/src/components/layout/account-text-field.tsx`
- Modify: `frontend/src/components/common/saved-techs-modal.tsx`
- Modify: existing focused tests under `frontend/src/pages/__tests__` and `frontend/src/components/layout/__tests__`.

**Interfaces:**
- Preserve: draft media, edit modal, save/retry, referral, owner/customer actions, account authentication/settings, and saved-tech behavior.
- Produce: editorial owner preview parity plus consistent dialogs, fields, empty states, and loading states.

- [ ] Add failing assertions for editorial preview, owner header, empty/loading states, and every shared dialog root.
- [ ] Run focused tech-profile, preview, modal, and accessibility tests and confirm failure.
- [ ] Apply the public-profile folio language to the owner preview without merging behavioral components.
- [ ] Restyle editor states and all shared dialogs/fields with square paper surfaces and ruled headers.
- [ ] Preserve circular icon-only controls and meaningful saved/destructive states.
- [ ] Run all focused tests, typecheck, and build.
- [ ] Commit with `feat: finish editorial application surfaces`.

---

### Task 6: Full Automated and Browser Verification

**Files:**
- Modify only when a verified defect is found: files owned by Tasks 1-5.
- Save screenshots outside the repository under the current Codex visualization directory.

**Interfaces:**
- Produce: verified desktop/mobile rendering and interaction behavior across all routes.

- [ ] Run `npm test --workspace @find-my-tech/frontend`, `npm run typecheck --workspace @find-my-tech/frontend`, and `npm run build --workspace @find-my-tech/frontend`.
- [ ] Inspect `/discover`, `/how-it-works`, `/for-techs`, `/artists/:id`, and `/tech-profile` at approximately 1440×1000 and 390×844.
- [ ] Exercise search, filters, sorting, save affordances, profile tabs, review form availability, login/register, referral reveal, tech CTA, dialogs, and owner editor actions when the local session/data permits.
- [ ] Confirm route headings, paper/rule rhythm, responsive hierarchy, focus visibility, no horizontal overflow, and no new console errors.
- [ ] Add a failing regression test before fixing any functional defect found during browser verification.
- [ ] Re-run the full automated commands after corrections.
- [ ] Commit final corrections with `fix: refine editorial application responsiveness` only when code changed.
