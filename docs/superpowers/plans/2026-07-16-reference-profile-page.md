# Reference-Inspired Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public artist profile with the supplied reference's hierarchy while preserving Muse's visual system and all existing interactions.

**Architecture:** Keep `artist-profile-page.tsx` as the workflow owner and extract the overview presentation into a focused feature component. Existing facade/API calls and state remain untouched; new `editorial-profile-*` classes own the responsive composition.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind utility classes, project editorial CSS, Vitest, happy-dom.

## Global Constraints

- Do not change backend or API contracts.
- Do not invent availability, achievements, community statistics, or services.
- Preserve customer save authorization, booking fallback behavior, review submission, contact links, and empty states.
- Keep all unrelated working-tree changes intact.

---

### Task 1: Reference-inspired profile hierarchy

**Files:**
- Modify: `frontend/src/pages/__tests__/artist-profile-page.test.ts`
- Modify: `frontend/src/pages/artist-profile-page.tsx`
- Modify: `frontend/src/pages/artist-profile/profile-tabs.tsx`
- Create: `frontend/src/pages/artist-profile/profile-overview.tsx`

**Interfaces:**
- Consumes: existing `Artist`, `PublicTechProfile`, active-tab state, and booking/save handlers.
- Produces: `ProfileOverview({ artist, profile, contact })` and the `overview | services | reviews` tab contract.

- [ ] Write failing assertions for the identity header, overview dossier, real-data insights, sticky appointment card, and overview tab.
- [ ] Run the focused profile test and confirm it fails because the new hierarchy is absent.
- [ ] Implement the new composition without changing data loading or mutation workflows.
- [ ] Run the focused test and confirm the new behavior passes.

### Task 2: Responsive editorial styling

**Files:**
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/pages/__tests__/artist-profile-page.test.ts`

**Interfaces:**
- Consumes: the `editorial-profile-*` class names emitted by the page and overview component.
- Produces: two-column desktop layout, circular overlapping portrait, sticky appointment panel, and single-column mobile layout.

- [ ] Add source assertions for the required layout hooks.
- [ ] Confirm the assertions fail before the CSS hooks exist.
- [ ] Add the minimal scoped CSS and responsive overrides.
- [ ] Re-run focused tests, typecheck, and build.

### Task 3: Full-flow verification

**Files:**
- Verify only.

- [ ] Run all frontend tests.
- [ ] Run frontend typecheck and production build.
- [ ] Start the local application and inspect a real public profile at desktop and phone widths.
- [ ] Exercise tabs, save, booking/message behavior, and review-form visibility where local data permits.
- [ ] Check browser console output and horizontal overflow.
