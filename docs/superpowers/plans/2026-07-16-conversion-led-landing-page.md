# Conversion-Led Landing Page Implementation Plan

**Goal:** Strengthen the Muse landing page using the supplied high-converting template's information sequence while preserving Muse's editorial identity and real discovery behavior.

**Architecture:** Keep `home-page.tsx` as the stateful discovery adapter and evolve `pages/home/editorial-landing.tsx` as the page-local presentation component. Add only factual, static marketing sections and accessible disclosure state; no API or database changes are required.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, happy-dom, CSS.

## Global Constraints

- Preserve structured and free-form discovery URL behavior.
- Do not introduce fake profiles, testimonials, ratings, logos, counts, or traction claims.
- Preserve the existing black-and-ivory editorial visual system and local imagery.
- Keep controls keyboard accessible, responsive, and reduced-motion safe.
- Preserve unrelated profile and account-settings work already present in the working tree.

## Task 1: Lock the conversion structure with tests

- Extend `frontend/src/pages/__tests__/home-page.test.tsx` with assertions for the proof strip, three-step process, four factual benefits, FAQ controls, and final discovery CTA.
- Run the focused test and confirm it fails because those sections do not exist.

## Task 2: Implement the landing-page story

- Update `frontend/src/pages/home/editorial-landing.tsx` with truthful proof points, a benefits grid, the search/compare/connect sequence, accessible FAQs, and a final customer CTA.
- Keep the current search form, imagery, privacy explanation, and tech CTA.
- Route the final customer CTA to `/discover` and the process explainer to `/how-it-works`.

## Task 3: Add responsive presentation

- Extend `frontend/src/assets/globals.css` with page-scoped styles for the new sections.
- Use thin rules, strong editorial type, asymmetrical content blocks, and one dark proof band as the page signature.
- Collapse grids cleanly at tablet and mobile widths without changing source order.

## Task 4: Verify the full experience

- Run the focused homepage test, full frontend test suite, typecheck, build, and `git diff --check`.
- Inspect desktop and mobile screenshots in a real browser.
- Exercise search, FAQ disclosure, final discovery CTA, tech CTA, and responsive navigation.
