# Discover Artist Card Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Discover artist cards as portrait-led editorial folios inspired by the supplied reference.

**Architecture:** Keep `ArtistCard` as the single shared marketplace card and preserve its existing props and navigation/save handlers. Add semantic sub-element classes in the component and implement the visual treatment in the existing editorial section of `globals.css`.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, project CSS, Vitest, Playwright CLI.

## Global Constraints

- Preserve the existing `ArtistCard` interface and saved-tech behavior.
- Do not fabricate verification or follower data.
- Use the established Muse black, ivory, paper, stone, display-serif, and utility-type tokens.
- Keep the existing Discover grid breakpoints.

---

### Task 1: Lock the new card contract

**Files:**
- Modify: `frontend/src/components/ui/__tests__/artist-card.test.tsx`

**Interfaces:**
- Consumes: `ArtistCard({ artist, saved, isSaving, onToggleSaved })`
- Produces: source-level render assertions for the portrait, information block, and profile footer

- [ ] Add assertions for `editorial-artist-card__portrait`, `editorial-artist-card__body`, `editorial-artist-card__footer`, and `View profile`.
- [ ] Run `npm run test -w frontend -- src/components/ui/__tests__/artist-card.test.tsx` and confirm it fails because the new markup is absent.

### Task 2: Build the portrait-led folio

**Files:**
- Modify: `frontend/src/components/ui/beauty-ui.tsx`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Consumes: the unchanged `Artist` fields and existing card callbacks
- Produces: a tall portrait, factual image labels, information block, metadata rail, and profile affordance

- [ ] Replace the shallow image wrapper with a `4:5` portrait wrapper while preserving the photo fallback and save button.
- [ ] Group name, price, specialty, rating, reviews, and location into the editorial body.
- [ ] Add a ruled footer showing at most two tags and `View profile`.
- [ ] Add focused CSS for proportion, rules, hover treatment, typography, and responsive spacing.
- [ ] Re-run the focused ArtistCard and Discover tests and confirm they pass.

### Task 3: Verify the finished Discover experience

**Files:**
- Verify: `frontend/src/pages/discover-page.tsx`
- Verify: `frontend/src/pages/discover/discover-results.tsx`

**Interfaces:**
- Consumes: the existing Discover grid and live featured-tech response
- Produces: browser evidence that desktop and mobile grids remain usable

- [ ] Run `npm test`, `npm run typecheck`, and `npm run build`.
- [ ] Open `/discover` in a real browser at `1440x1000` and `390x844`.
- [ ] Confirm cards, Save, mobile navigation, and profile navigation are visible and the console contains no errors.
- [ ] Commit the implementation after verification.
