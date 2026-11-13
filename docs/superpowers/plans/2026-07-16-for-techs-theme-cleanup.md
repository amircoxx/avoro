# For Techs Theme Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone referral panel, convert the `/for-techs` marketing surface to the editorial black-and-cream palette, and keep both signup calls to action legible on hover.

**Architecture:** Keep the change local to the existing For Techs page, its extracted final marketing CTA, and page-scoped editorial CSS. Replace overlapping utility/override combinations with semantic page classes so each CTA has one explicit default and hover contract.

**Tech Stack:** React 18, TypeScript, Tailwind utility classes, shared CSS custom properties, Vitest, happy-dom, Playwright CLI.

## Global Constraints

- Remove only the standalone “Know a fellow tech?” referral panel.
- Preserve the referral feature card, referral FAQ, and referral-code onboarding behavior.
- Use only `--editorial-ink`, `--editorial-paper`, `--editorial-ivory`, `--editorial-stone`, and `--editorial-taupe` for decorative For Techs marketing colors.
- Preserve semantic success and error colors inside the signup workflow.
- Preserve page copy, routing, signup behavior, and responsive structure.
- Preserve all pre-existing uncommitted work. Do not stage or commit overlapping implementation files unless the user later requests it.

---

### Task 1: Lock the referral-removal and palette contracts with failing tests

**Files:**
- Modify: `frontend/src/pages/__tests__/for-techs-page.test.ts`
- Modify: `frontend/src/__tests__/editorial-surfaces.test.ts`

**Interfaces:**
- Consumes: `ForTechsPage` rendered through the existing `renderPage()` helper and the source/CSS files read with `readFileSync`.
- Produces: Regression coverage for the removed panel, retained referral information, decorative palette, and CTA hover contrast.

- [ ] **Step 1: Add the failing referral-panel test**

Add this case to `frontend/src/pages/__tests__/for-techs-page.test.ts`:

```ts
it("removes the standalone referral promotion without removing referral guidance", async () => {
  const view = await renderPage();

  expect(view.container.textContent).not.toContain("Know a fellow tech?");
  expect(view.container.textContent).not.toContain("muse.app/join?ref=yourhandle");
  expect(view.container.textContent).toContain("Referral rewards");
  expect(view.container.textContent).toContain("How does the referral program work?");
  view.cleanup();
});
```

- [ ] **Step 2: Add failing source and CSS theme-contract tests**

Replace the existing orange-hover assertion in `frontend/src/__tests__/editorial-surfaces.test.ts` with:

```ts
it("uses only editorial decorative colors on the For Techs marketing page", () => {
  const source = readFileSync(new URL("../pages/for-techs-page.tsx", import.meta.url), "utf8");
  const pageSource = source.slice(source.indexOf("export default function ForTechsPage"));

  expect(pageSource).not.toMatch(/\b(?:bg|text|border)-(?:rose|violet|emerald|amber|cyan|pink)-\d+/);
  expect(pageSource).not.toContain("rgba(196,80,107");
});

it("keeps both For Techs signup actions legible on hover", () => {
  const stylesheet = readFileSync(new URL("../assets/globals.css", import.meta.url), "utf8");

  expect(stylesheet).toMatch(
    /\.editorial-for-techs-primary:hover\s*{[^}]*background:\s*var\(--editorial-stone\);[^}]*color:\s*var\(--editorial-ink\);/s
  );
  expect(stylesheet).toMatch(
    /\.editorial-marketing-cta__button:hover\s*{[^}]*background:\s*var\(--editorial-stone\);[^}]*color:\s*var\(--editorial-ink\);/s
  );
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm --prefix frontend test -- src/pages/__tests__/for-techs-page.test.ts src/__tests__/editorial-surfaces.test.ts
```

Expected: FAIL because the referral panel and non-editorial marketing colors still exist, and the semantic CTA hover rules do not yet exist.

---

### Task 2: Apply the page-scoped editorial palette and remove the panel

**Files:**
- Modify: `frontend/src/pages/for-techs-page.tsx`
- Modify: `frontend/src/pages/for-techs/marketing-sections.tsx`
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/pages/__tests__/for-techs-page.test.ts`
- Test: `frontend/src/__tests__/editorial-surfaces.test.ts`

**Interfaces:**
- Consumes: Existing `--editorial-*` CSS custom properties and `MarketingSections({ onJoin })` callback contract.
- Produces: `.editorial-for-techs-primary` and `.editorial-marketing-cta__button` visual contracts.

- [ ] **Step 1: Remove the standalone referral panel and decorative color utilities**

In `frontend/src/pages/for-techs-page.tsx`:

- Delete the entire section containing “Know a fellow tech?” and `muse.app/join?ref=yourhandle`.
- Delete the three decorative rose/amber hero glow elements.
- Change the launch badge classes to `editorial-for-techs-launch` plus its existing layout utilities.
- Change the heading emphasis to `editorial-for-techs-accent not-italic`.
- Change the hero CTA from `bg-primary ... hover:bg-rose-700 ...` to `editorial-for-techs-primary ...`.
- Remove the `c` field from each feature item and render every icon wrapper with `editorial-for-techs-feature-icon`.
- Change the comparison “Muse” label to `editorial-for-techs-brand-label`.
- Change both true checkmarks to `editorial-for-techs-check` while leaving unavailable marks as neutral gray.

- [ ] **Step 2: Give the final CTA an explicit semantic class**

In `frontend/src/pages/for-techs/marketing-sections.tsx`, replace the button’s `bg-primary`, `text-primary-foreground`, and `hover:bg-rose-700` utilities with `editorial-marketing-cta__button` while preserving its sizing and layout utilities.

- [ ] **Step 3: Replace conflicting CSS overrides with token-based semantic rules**

In `frontend/src/assets/globals.css`, replace the `.editorial-for-techs button.bg-primary` rules and orange final-CTA hover with:

```css
.editorial-for-techs-launch,
.editorial-for-techs-brand-label,
.editorial-for-techs-check,
.editorial-for-techs-accent {
  color: var(--editorial-ink);
}

.editorial-for-techs-launch {
  border-color: var(--editorial-stone);
  background: var(--editorial-paper);
}

.editorial-for-techs-primary {
  border: 1px solid var(--editorial-ink);
  background: var(--editorial-ink);
  color: var(--editorial-paper);
}

.editorial-for-techs-primary:hover,
.editorial-for-techs-primary:focus-visible {
  border-color: var(--editorial-stone);
  background: var(--editorial-stone);
  color: var(--editorial-ink);
}

.editorial-for-techs-feature-icon {
  border: 1px solid var(--editorial-stone);
  background: transparent;
  color: var(--editorial-ink);
}

.editorial-marketing-cta__button:hover,
.editorial-marketing-cta__button:focus-visible {
  border-color: var(--editorial-stone);
  background: var(--editorial-stone);
  color: var(--editorial-ink);
}
```

Keep the existing final CTA default state as paper background with ink text.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm --prefix frontend test -- src/pages/__tests__/for-techs-page.test.ts src/__tests__/editorial-surfaces.test.ts
```

Expected: both test files pass with zero failures.

---

### Task 3: Verify behavior, build integrity, and responsive rendering

**Files:**
- Verify: `frontend/src/pages/for-techs-page.tsx`
- Verify: `frontend/src/pages/for-techs/marketing-sections.tsx`
- Verify: `frontend/src/assets/globals.css`
- Artifacts: `output/playwright/for-techs-theme-desktop.png`
- Artifacts: `output/playwright/for-techs-theme-mobile.png`

**Interfaces:**
- Consumes: Completed page implementation and existing frontend scripts.
- Produces: Fresh automated and browser evidence for the requested behavior.

- [ ] **Step 1: Run the full frontend regression suite**

```bash
npm --prefix frontend test
```

Expected: all frontend tests pass with zero failures.

- [ ] **Step 2: Run static verification**

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

Expected: every command exits `0` with no type, build, or whitespace errors.

- [ ] **Step 3: Verify the desktop page and hover state in a real browser**

Start the frontend using the repository’s development command, open `/for-techs` at a desktop viewport, and confirm:

- “Know a fellow tech?” is absent.
- Feature marks and decorative accents use only ink/cream/stone tones.
- The hero CTA opens the tech signup modal.
- The final CTA remains readable before and during hover.
- Capture `output/playwright/for-techs-theme-desktop.png`.

- [ ] **Step 4: Verify responsive layout**

Set a mobile viewport, confirm the CTA and content remain usable without horizontal overflow, and capture `output/playwright/for-techs-theme-mobile.png`.

- [ ] **Step 5: Review the final scoped diff**

```bash
git diff -- frontend/src/pages/for-techs-page.tsx frontend/src/pages/for-techs/marketing-sections.tsx frontend/src/assets/globals.css frontend/src/pages/__tests__/for-techs-page.test.ts frontend/src/__tests__/editorial-surfaces.test.ts
```

Expected: only the approved referral removal, theme alignment, CTA contrast fix, and their tests appear alongside preserved pre-existing edits.
