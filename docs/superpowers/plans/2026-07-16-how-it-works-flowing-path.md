# How It Works Flowing Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing stacked How It Works cards with a responsive, Muse-branded flowing customer journey and a compact tech invitation.

**Architecture:** Keep all route behavior in `HowItWorksPage` and express the process as semantic data mapped into an ordered list. Use a decorative inline SVG only for the desktop route line, with route-scoped CSS providing layout, mobile fallback, motion, and reduced-motion handling.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Happy DOM, Tailwind CSS utilities, route-scoped CSS, Lucide React.

## Global Constraints

- Preserve the existing `/discover` and `/for-techs` CTA destinations.
- Use editorial black `var(--editorial-ink)` as the sole accent on the page.
- Close the page with paper white `#FCFBF7`, carbon text, a black top rule, and a black-outlined shield; do not use an orange, plum, mauve, or solid black privacy band.
- Preserve the existing Muse display and utility type stacks.
- Do not change backend services, APIs, authentication, shared routing, or other pages.
- Do not add dependencies, stock photos, fabricated statistics, or testimonials.
- The SVG path is decorative; semantic meaning must remain in an ordered list.
- Mobile must use a readable vertical sequence without horizontal overflow.
- Reduced-motion users must see the complete static composition immediately.

---

### Task 1: Lock the Page Contract With Tests

**Files:**
- Create: `frontend/src/pages/__tests__/how-it-works-page.test.tsx`
- Modify: `frontend/src/pages/how-it-works-page.tsx`

**Interfaces:**
- Consumes: `HowItWorksPage(): JSX.Element`, `useRouter(): { push(path: string): void }`.
- Produces: a `main`-equivalent route root, one ordered customer journey with three list items, and buttons that push `/discover` and `/for-techs`.

- [ ] **Step 1: Write the failing render and navigation tests**

Mock `@/hooks/router`, render `HowItWorksPage`, and assert the page contains exactly three customer journey list items with the headings `Search near you`, `Compare the work`, and `Connect directly`. Click `Find an artist` and `Create your free profile`, asserting the router receives `/discover` and `/for-techs`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: FAIL because the current page renders eight process cards and does not expose the new three-step journey copy.

- [ ] **Step 3: Implement the semantic page structure**

Replace `HowItWorksPage` with route-local `customerSteps` and `techSteps` constants. Render customer steps inside `<ol className="muse-route__steps">`, use real text for visible numbers, add `aria-hidden="true"` to decorative numbers and SVG, and keep both CTA handlers on the existing router hook.

- [ ] **Step 4: Run the focused test and confirm success**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: PASS.

### Task 2: Build the Flowing Desktop and Mobile Composition

**Files:**
- Modify: `frontend/src/pages/how-it-works-page.tsx`
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/pages/__tests__/how-it-works-page.test.tsx`

**Interfaces:**
- Consumes: `.editorial-page`, `.editorial-display`, `.editorial-kicker`, `.editorial-button`, and shared editorial color/type variables.
- Produces: route-scoped `.muse-route*` classes and a decorative `.muse-route__line` SVG.

- [ ] **Step 1: Add a failing structural style test**

Read `globals.css` and assert it contains `.muse-route__line`, a mobile `@media (max-width: 767px)` treatment for `.muse-route__steps`, and a `prefers-reduced-motion: reduce` rule affecting the route animation.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: FAIL because the route-scoped styles do not exist.

- [ ] **Step 3: Add the route-scoped visual system**

Append `.muse-route*` rules to `globals.css` without rewriting existing content. Desktop uses a minimum-height journey canvas, a black bezier SVG, three staggered absolute-grid milestone positions, translucent background numbers, paper-colored route nodes, and a ruled three-column tech strip. At `767px` and below, hide the SVG, reset milestone positioning, use a black vertical spine, stack the tech strip, and keep buttons full-width only where useful.

- [ ] **Step 4: Add restrained motion and reduced-motion fallback**

Animate the SVG stroke once with `stroke-dasharray`/`stroke-dashoffset` and reveal milestones in sequence. Disable animation and transitions inside `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 5: Run the focused test and confirm success**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: PASS.

### Task 3: Verify the Complete Route

**Files:**
- Verify: `frontend/src/pages/how-it-works-page.tsx`
- Verify: `frontend/src/assets/globals.css`
- Verify: `frontend/src/pages/__tests__/how-it-works-page.test.tsx`

**Interfaces:**
- Consumes: the complete route implementation.
- Produces: test, type, build, browser, and interaction evidence.

- [ ] **Step 1: Run automated verification**

Run from `frontend/`: `npm test`, `npm run typecheck`, and `npm run build`.

Expected: all commands exit `0`.

- [ ] **Step 2: Inspect desktop and mobile in a real browser**

Start the Vite app and inspect `/how-it-works` at `1440x1000` and `390x844`. Confirm the desktop path aligns with all three nodes, the mobile sequence reads top-to-bottom, the tech invitation remains compact, no content clips, and there is no horizontal scrollbar.

- [ ] **Step 3: Exercise the route**

Activate both CTAs, confirm `/discover` and `/for-techs` navigation, keyboard through interactive controls, emulate reduced motion, and confirm no new console errors.

- [ ] **Step 4: Review the final diff**

Run `git diff --check` and inspect the diff limited to the new test, the How It Works page, and the appended route styles. Confirm unrelated Discover work remains untouched.

### Task 4: Lighten the Privacy Close

**Files:**
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/pages/__tests__/how-it-works-page.test.tsx`

**Interfaces:**
- Consumes: `.muse-process-privacy`, `.muse-process-privacy__mark`, and the existing editorial color variables.
- Produces: a paper-white privacy section with carbon copy, a black top rule, and a black-outlined shield.

- [ ] **Step 1: Add a failing visual-contract test**

Read `globals.css` and assert the privacy block uses `background: var(--editorial-paper)`, `color: var(--editorial-ink)`, and `border-top: 3px solid var(--editorial-ink)`; also assert its mark uses a black border and the route block contains no previous orange, plum, or mauve values.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: FAIL because the current privacy close uses a carbon background, paper text, and a translucent light border.

- [ ] **Step 3: Implement the approved lighter treatment**

Use `var(--editorial-ink)` for every How It Works accent, including the compact kicker, and keep `var(--editorial-paper)` for the privacy background. Preserve the existing grid, spacing, typography, content, and mobile layout.

- [ ] **Step 4: Run the focused test and confirm success**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Verify the refined route**

Run the full frontend test suite, typecheck, and build. Capture desktop and mobile screenshots of `/how-it-works`, confirm the privacy close no longer creates a black block, and verify no overflow or console errors.

### Task 5: Open Registration from the Tech CTA

**Files:**
- Create: `frontend/src/components/layout/account-auth-context.tsx`
- Modify: `frontend/src/components/layout/beauty-shell.tsx`
- Modify: `frontend/src/components/layout/site-header.tsx`
- Modify: `frontend/src/pages/how-it-works-page.tsx`
- Test: `frontend/src/pages/__tests__/how-it-works-page.test.tsx`

**Interfaces:**
- Produces: `AccountAuthProvider`, `useAccountAuth()`, and `openAccountAuth("register")` as the shared overlay trigger.
- Consumes: the existing `AccountAuthModal`, its `initialMode`, and the header's authenticated-user callback.

- [ ] **Step 1: Write the failing CTA interaction test**

Render `HowItWorksPage` inside `AccountAuthProvider` with a context probe. Click `Create your free profile`, assert the context mode becomes `register`, and assert the router does not receive `/for-techs`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`

Expected: FAIL because the CTA currently pushes `/for-techs` and no shared auth-overlay context exists.

- [ ] **Step 3: Add the shared overlay controller**

Create a provider that stores `"login" | "register" | null` and exposes `openAccountAuth(mode)` plus `closeAccountAuth()`. Wrap `SiteHeader` and route children with it in `BeautyShell`. Replace the header's local modal-mode state with the shared controller while leaving authenticated-user ownership in `SiteHeader`.

- [ ] **Step 4: Wire the tech CTA to registration mode**

In `HowItWorksPage`, call `openAccountAuth("register")` from `Create your free profile`. Keep `Find an artist` routed to `/discover` and preserve all button copy and styling.

- [ ] **Step 5: Run automated verification**

Run from `frontend/`: `npm test -- --run src/pages/__tests__/how-it-works-page.test.tsx`, `npm test`, `npm run typecheck`, and `npm run build`.

Expected: all commands exit `0`.

- [ ] **Step 6: Verify the overlay in a real browser**

Open `/how-it-works`, click `Create your free profile`, and confirm the URL remains `/how-it-works`, the account dialog appears in `Create your account` mode, the overlay closes normally, and the console has no errors.
