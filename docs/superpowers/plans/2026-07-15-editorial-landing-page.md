# Editorial Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reference-faithful black-and-ivory Muse landing experience with original nail/lash imagery while preserving discovery and account behavior.

**Architecture:** Keep `home-page.tsx` responsible for discovery state and routing, and extract the visual composition into focused page-local components under `pages/home/`. Restyle the existing shared header and footer in place so their established authentication, account, toast, and routing contracts remain unchanged. Bundle generated editorial imagery through Vite imports and require no backend work.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, Lucide React, Vitest, happy-dom, Playwright CLI.

## Global Constraints

- Use porcelain ivory `#F5F2EA`, paper white `#FCFBF7`, carbon black `#11110F`, warm stone `#D8D2C8`, and muted taupe `#817A70`.
- Preserve `/discover` query parameters for service, structured selected location, and free-form location fallback.
- Preserve role-aware navigation, login/register modals, saved-tech controls, account settings, logout, and tech-profile routing.
- Do not add fabricated profiles, reviews, testimonials, customer counts, or traction claims.
- Keep all image assets local; do not add runtime third-party image URLs.
- Use visible keyboard focus, semantic headings, meaningful alternative text, accessible disclosure state, and reduced-motion support.
- Do not redesign interior application pages or change backend/API/database contracts.

---

## File Structure

- Create `frontend/src/assets/landing/hero-nails.png`: wide hero crop showing editorial nail work.
- Create `frontend/src/assets/landing/edit-nails.png`: portrait nail-detail image.
- Create `frontend/src/assets/landing/edit-lashes.png`: portrait lash-detail image.
- Create `frontend/src/assets/landing/edit-artist.png`: portrait artist-at-work detail.
- Create `frontend/src/pages/home/editorial-landing.tsx`: pure visual sections, service disclosures, facts, gallery, privacy, and tech callout.
- Modify `frontend/src/pages/home-page.tsx`: discovery input state, URL construction, image imports, and composition.
- Modify `frontend/src/pages/__tests__/home-page.test.tsx`: discovery and disclosure behavior coverage.
- Modify `frontend/src/components/layout/site-header.tsx`: editorial structure and styles while retaining all behavior.
- Modify `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`: shell navigation regression assertions.
- Modify `frontend/src/components/layout/site-footer.tsx`: editorial styling and current copyright year.
- Modify `frontend/src/assets/globals.css`: font stacks, landing tokens, base type, focus, and reduced-motion rules.

---

### Task 1: Generate and Bundle the Editorial Image Set

**Files:**
- Create: `frontend/src/assets/landing/hero-nails.png`
- Create: `frontend/src/assets/landing/edit-nails.png`
- Create: `frontend/src/assets/landing/edit-lashes.png`
- Create: `frontend/src/assets/landing/edit-artist.png`

**Interfaces:**
- Consumes: Vite static asset imports.
- Produces: four local PNG modules imported by `home-page.tsx` as `string` URLs.

- [ ] **Step 1: Generate the coordinated image set**

Use the image-generation skill to create a cohesive luxury beauty editorial set with neutral black, ivory, stone, and skin tones; photographic realism; no text, logos, watermarks, hands with malformed anatomy, or distracting props. Generate one wide nail hero and three portrait crops covering nails, lashes, and an artist working.

- [ ] **Step 2: Save and inspect the image files**

Place the outputs at the exact paths above and inspect every file at original resolution. Reject outputs with distorted fingers, tools touching eyes unsafely, illegible manicure details, visible text, or inconsistent lighting.

- [ ] **Step 3: Verify file dimensions and repository shape**

Run:

```bash
file frontend/src/assets/landing/*.png
du -h frontend/src/assets/landing/*.png
```

Expected: four valid PNG files; hero is landscape; edit images are portrait; no single file is large enough to create an unreasonable landing-page payload.

- [ ] **Step 4: Commit the image set**

```bash
git add frontend/src/assets/landing
git commit -m "feat: add editorial beauty imagery"
```

---

### Task 2: Build the Landing Composition with TDD

**Files:**
- Create: `frontend/src/pages/home/editorial-landing.tsx`
- Modify: `frontend/src/pages/home-page.tsx:1-256`
- Modify: `frontend/src/pages/__tests__/home-page.test.tsx:1-78`

**Interfaces:**
- Consumes: `LocationSuggestion`, `LocationAutocomplete`, `useRouter`, and four image URL strings.
- Produces: `EditorialLanding` with props `{ query, locationLabel, images, onQueryChange, onLocationSelect, onLocationClear, onSearch, onNavigate }` and accessible disclosure buttons.

- [ ] **Step 1: Extend the homepage test harness**

Replace the autocomplete mock with a button that invokes `onSelect` and add assertions for factual content, image alternatives, disclosures, and search navigation:

```tsx
vi.mock("@/components/common/location-autocomplete", () => ({
  default: ({ onSelect }: { onSelect: (value: LocationSuggestion) => void }) =>
    createElement("button", {
      type: "button",
      "aria-label": "Choose Brooklyn",
      onClick: () => onSelect({ label: "Brooklyn, NY, USA", city: "Brooklyn", state: "NY", country: "US" })
    }, "Choose Brooklyn")
}));

it("renders the editorial marketplace without invented traction", async () => {
  const view = await renderPage();
  expect(view.container.textContent).toContain("Your next beauty artist is closer than you think.");
  expect(view.container.textContent).toContain("02");
  expect(view.container.textContent).toContain("00");
  expect(view.container.textContent).not.toMatch(/clients coached|years experience|Mia Chen/i);
  expect(view.container.querySelectorAll("img[alt]")).toHaveLength(4);
});

it("opens a service disclosure accessibly", async () => {
  const view = await renderPage();
  const button = view.container.querySelector<HTMLButtonElement>('button[aria-controls="service-panel-nails"]');
  expect(button?.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button?.click());
  expect(button?.getAttribute("aria-expanded")).toBe("true");
  expect(view.container.textContent).toContain("Gel sets, acrylics, extensions, and nail art");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm test --workspace @find-my-tech/frontend -- frontend/src/pages/__tests__/home-page.test.tsx
```

Expected: FAIL because the editorial copy, image set, and disclosure controls do not exist.

- [ ] **Step 3: Create the pure editorial section component**

Implement these exported types and component boundary in `editorial-landing.tsx`:

```tsx
export type LandingImages = {
  hero: string;
  nails: string;
  lashes: string;
  artist: string;
};

export type EditorialLandingProps = {
  query: string;
  locationLabel: string;
  images: LandingImages;
  onQueryChange: (value: string) => void;
  onLocationSelect: (suggestion: LocationSuggestion) => void;
  onLocationClear: () => void;
  onSearch: () => void;
  onNavigate: (path: string) => void;
};
```

Inside the component, use a `Set<string>` or single `openService` state to control four disclosure buttons. Each button must set `aria-expanded`, target a stable `aria-controls` id, and render its associated panel only when open. Compose semantic sections for hero, search, ledger/facts, `The Beauty Edit`, privacy, and the black tech CTA. Use `type="button"` on every non-submit button.

- [ ] **Step 4: Rebuild `home-page.tsx` as the stateful adapter**

Retain the current `goDiscover()` URL logic exactly, import the four image modules, and render:

```tsx
<EditorialLanding
  query={query}
  locationLabel={loc}
  images={{ hero: heroNails, nails: editNails, lashes: editLashes, artist: editArtist }}
  onQueryChange={setQuery}
  onLocationSelect={(suggestion) => {
    setSelectedLocation(suggestion);
    setLoc(suggestion.label);
  }}
  onLocationClear={() => {
    setSelectedLocation(null);
    setLoc("");
  }}
  onSearch={goDiscover}
  onNavigate={router.push}
/>
```

- [ ] **Step 5: Add structured-location navigation coverage**

Add a test that selects Brooklyn, enters `Gel nails`, clicks `Search artists`, and expects:

```tsx
expect(navigate).toHaveBeenCalledWith(
  "/discover?q=Gel+nails&city=Brooklyn&state=NY&country=US&location=Brooklyn%2C+NY%2C+USA"
);
```

- [ ] **Step 6: Run the focused test until green**

Run the same Vitest command from Step 2.

Expected: all homepage tests PASS with no React `act()` warnings.

- [ ] **Step 7: Commit the landing composition**

```bash
git add frontend/src/pages/home-page.tsx frontend/src/pages/home frontend/src/pages/__tests__/home-page.test.tsx
git commit -m "feat: rebuild editorial landing page"
```

---

### Task 3: Restyle the Shared Header Without Regressing Account Behavior

**Files:**
- Modify: `frontend/src/components/layout/site-header.tsx:1-63`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Consumes: existing `loadAccountSession`, `logoutUser`, account modals, saved-tech modal, router hooks.
- Produces: the same `SiteHeader(): JSX.Element` API and existing modal/menu behavior.

- [ ] **Step 1: Add editorial shell assertions**

Add assertions to the existing shell test that the wordmark is `MUSE`, the primary nav exposes `Home`, `Discover`, and `How It Works`, the nav has `aria-label="Primary navigation"`, and the mobile toggle preserves `aria-expanded` plus `aria-controls="mobile-navigation"`.

- [ ] **Step 2: Run the shell test and verify failure**

```bash
npm test --workspace @find-my-tech/frontend -- frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
```

Expected: FAIL because the current wordmark casing, Home link, nav label, and mobile relationships are absent.

- [ ] **Step 3: Implement the centered editorial header**

Refactor only the returned markup and class names. Keep state, effects, handlers, and modal rendering unchanged. Use a three-column desktop grid so the wordmark remains geometrically centered:

```tsx
<nav aria-label="Primary navigation" className="editorial-header">
  <div className="editorial-header__inner">
    <div className="editorial-header__left">
      {navLink("Home", "/")}
      {navLink("Discover", "/discover")}
      {navLink("How It Works", "/how-it-works")}
    </div>
    <button className="editorial-wordmark" onClick={() => router.push("/")}>MUSE</button>
    <div className="editorial-header__right">
      {navLink(techNavLabel, techNavPath)}
      <HeaderAuthActions
        authUser={authUser}
        pathname={pathname}
        onLogin={() => setAuthModalMode("login")}
        onRegister={() => setAuthModalMode("register")}
        onSettings={() => setIsSettingsOpen(true)}
        onSavedTechs={() => setIsSavedTechsOpen(true)}
        onSignOut={() => void signOut()}
      />
    </div>
  </div>
</nav>
```

Give the mobile toggle `aria-expanded={open}` and `aria-controls="mobile-navigation"`; give the opened menu that id. Replace rounded/pink button styling inside the header and account menu with square ivory/black editorial controls without changing actions or roles.

- [ ] **Step 4: Run header and homepage tests**

```bash
npm test --workspace @find-my-tech/frontend -- frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts frontend/src/pages/__tests__/home-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the header**

```bash
git add frontend/src/components/layout/site-header.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: restyle editorial site header"
```

---

### Task 4: Apply the Editorial Tokens and Footer

**Files:**
- Modify: `frontend/src/assets/globals.css:1-150`
- Modify: `frontend/src/components/layout/site-footer.tsx:1-14`

**Interfaces:**
- Consumes: existing Tailwind theme variables, router, Sonner toasts, and footer link actions.
- Produces: global editorial CSS utilities and the same `SiteFooter(): JSX.Element` API.

- [ ] **Step 1: Add a current-year footer regression assertion**

In the shell accessibility test, assert the footer contains `© 2026 Muse Inc.` and its Instagram control remains labeled.

- [ ] **Step 2: Run the shell test and verify failure**

Run the Task 3 focused shell command.

Expected: FAIL because the footer currently says 2025.

- [ ] **Step 3: Add font and editorial tokens**

At the top of `globals.css`, define named variables with local/system fashion-serif and compact sans fallbacks so typography does not depend on a runtime font request:

```css
:root {
  --editorial-ivory: #f5f2ea;
  --editorial-paper: #fcfbf7;
  --editorial-ink: #11110f;
  --editorial-stone: #d8d2c8;
  --editorial-taupe: #817a70;
  --font-display: "Bodoni 72", Didot, "Times New Roman", serif;
  --font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif;
}
```

Add page-scoped classes for the header, hero, discovery form, service ledger, facts, gallery, privacy, CTA, and footer. Use fluid `clamp()` type, hairline rules, square corners, `:focus-visible` outlines, and a `@media (prefers-reduced-motion: reduce)` rule that removes smooth scrolling and transitions.

- [ ] **Step 4: Restyle the footer in place**

Keep the existing `columns` data and every action. Replace the JSX class names with semantic `editorial-footer*` classes, render the wordmark as `MUSE`, update the copyright to `© 2026 Muse Inc. All rights reserved.`, and retain the Instagram accessible name.

- [ ] **Step 5: Run focused tests, typecheck, and build**

```bash
npm test --workspace @find-my-tech/frontend -- frontend/src/pages/__tests__/home-page.test.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
npm run typecheck --workspace @find-my-tech/frontend
npm run build --workspace @find-my-tech/frontend
```

Expected: tests PASS, TypeScript exits 0, and Vite produces `frontend/dist` successfully.

- [ ] **Step 6: Commit the visual system and footer**

```bash
git add frontend/src/assets/globals.css frontend/src/components/layout/site-footer.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: finish editorial site shell"
```

---

### Task 5: Full Verification and Visual Critique

**Files:**
- Modify if defects are found: files owned by Tasks 2-4.

**Interfaces:**
- Consumes: completed editorial page and existing application routes.
- Produces: verified desktop/mobile experience with no known landing regressions.

- [ ] **Step 1: Run the complete frontend verification suite**

```bash
npm test --workspace @find-my-tech/frontend
npm run typecheck --workspace @find-my-tech/frontend
npm run build --workspace @find-my-tech/frontend
```

Expected: all frontend tests PASS; typecheck and build exit 0.

- [ ] **Step 2: Start the frontend and inspect desktop**

Run `npm run dev:frontend`, open `http://localhost:3000`, and inspect at approximately 1440×1000. Verify header centering, hero crop and headline contrast, search form alignment, ledger/facts proportion, three-image rhythm, privacy rules, black tech CTA, footer, and no horizontal overflow.

- [ ] **Step 3: Exercise the real interactions**

Verify Home, Discover, How It Works, For Techs/My Profile, login/register, account menu, mobile menu, hero CTA, service disclosures, search submission, tech CTA, and footer actions. Confirm service/location search lands on `/discover` with the expected parameters.

- [ ] **Step 4: Inspect phone layout**

Inspect at approximately 390×844. Verify the sequence is hero, discovery, ledger, facts, gallery, privacy, tech CTA, footer; image crops remain meaningful; buttons have usable touch targets; disclosures and mobile navigation work; and no text clips.

- [ ] **Step 5: Compare against the supplied reference and critique**

Capture desktop and phone screenshots. Compare section proportions, thin-rule rhythm, restrained palette, display typography, hero dominance, two-column facts layout, and three-image edit against the reference. Remove any decorative element that reads as unrelated app-template styling.

- [ ] **Step 6: Re-run verification after visual fixes**

Repeat the complete commands from Step 1 after any corrections.

- [ ] **Step 7: Commit final corrections**

```bash
git add frontend/src
git commit -m "fix: refine editorial landing responsiveness"
```

Skip this commit when visual verification requires no code changes.
