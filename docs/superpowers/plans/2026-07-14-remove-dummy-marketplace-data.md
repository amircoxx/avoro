# Remove Dummy Marketplace Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove static marketplace profile data so only API-backed tech profiles appear in the product.

**Architecture:** Keep the existing API-to-facade flow. Replace fixture-derived mapper defaults with neutral values derived only from each API profile, delete the fixture module, and remove hardcoded profile presentation from the landing page.

**Tech Stack:** React 19, TypeScript, Vite, Vitest.

## Global Constraints

- Do not alter API request shapes or public route paths.
- Do not display invented tech names, ratings, locations, portfolios, reviews, or testimonials.
- Retain safe neutral fallbacks for incomplete real profiles.

---

### Task 1: Map public profiles without fixture data

**Files:**
- Modify: `frontend/src/services/api/profiles.ts`
- Modify: `frontend/src/services/__tests__/profiles.test.ts`
- Delete: `frontend/src/assets/artists.ts` after consumers use type-only imports from the mapper module.

**Interfaces:**
- Consumes: `PublicTechProfile` from `frontend/src/services/api/types.ts`.
- Produces: `Artist` display models containing only API values or neutral defaults.

- [ ] **Step 1: Write the failing test**

Add a test for an incomplete `PublicTechProfile` that calls `mapTechProfileToArtist` and asserts neutral fallbacks such as `photo: ""`, `cover: ""`, `gallery: []`, `reviews: []`, `distance: ""`, `rating: 0`, `tags: []`, and `priceLabel: "Contact for pricing"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts`

Expected: FAIL because the mapper currently supplies values from `ARTISTS`.

- [ ] **Step 3: Write minimal implementation**

Define the `Artist`, `ArtistType`, `Service`, and `Review` presentation types in `frontend/src/services/api/profiles.ts`, remove the `ARTISTS` import, and map missing API fields to neutral empty values. Update type-only imports in components and facades to import `Artist` from `@/services/api`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts`

Expected: PASS.

### Task 2: Remove landing-page demo profiles

**Files:**
- Modify: `frontend/src/pages/home-page.tsx`
- Test: `frontend/src/pages/__tests__/home-page.test.tsx` (create if absent)

**Interfaces:**
- Consumes: existing `useRouter` navigation.
- Produces: a landing page with a neutral marketplace CTA and no static profile records.

- [ ] **Step 1: Write the failing test**

Render `LandingPage`, assert profile names `Mia Chen`, `Jasmine Wade`, and `Destiny Lewis` are absent, and assert the `Discover all artists` button still routes to `/discover`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/pages/__tests__/home-page.test.tsx`

Expected: FAIL because the hardcoded cards and testimonial are currently rendered.

- [ ] **Step 3: Write minimal implementation**

Remove the three profile-card buttons, their hardcoded review card, the Atlanta-specific featured heading, and the named testimonial. Preserve the search UI and discovery CTA with neutral copy.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/pages/__tests__/home-page.test.tsx`

Expected: PASS.

### Task 3: Verify no fixture remains in shipped frontend code

**Files:**
- Delete: `frontend/src/assets/artists.ts`

**Interfaces:**
- Consumes: compiled frontend source.
- Produces: a frontend that builds without the fixture module.

- [ ] **Step 1: Run focused tests**

Run: `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts src/pages/__tests__/home-page.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run production verification**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run build && ! rg -n "ARTISTS|Mia Chen|Jasmine Wade|Destiny Lewis" frontend/src --glob '!**/__tests__/**'`

Expected: both commands exit 0; no static artist fixture or named dummy profile remains in application source.
