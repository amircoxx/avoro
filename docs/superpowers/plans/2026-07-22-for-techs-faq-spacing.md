# For Techs FAQ Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/for-techs` Common questions cards feel spacious and readable by removing an accidental shared-class collision and applying deliberate responsive spacing.

**Architecture:** Keep the existing FAQ data and stacked card markup in `ForTechsPage`. Give the cards a For Techs-specific class and Tailwind spacing utilities so the homepage `.editorial-faq` section rules cannot affect them; lock that contract into the existing For Techs page test.

**Tech Stack:** React 19, TypeScript, Tailwind CSS utilities, Vitest, happy-dom

## Global Constraints

- Keep the existing centered heading and stacked bordered-card presentation.
- Use 48px between the heading and list, 24px between cards, 28px card padding on small screens, 32px from the medium breakpoint, and 12px between question and answer.
- Do not change FAQ copy, homepage FAQ styles, global color tokens, or any other For Techs section.
- Preserve the current Playfair display treatment, muted answer copy, square borders, colors, and responsive page width.

---

### Task 1: Isolate and space the For Techs FAQ cards

**Files:**
- Modify: `frontend/src/pages/for-techs-page.tsx:314-334`
- Test: `frontend/src/pages/__tests__/for-techs-page.test.ts`

**Interfaces:**
- Consumes: the existing `Common questions` heading and five inline `{ q, a }` FAQ entries in `ForTechsPage`.
- Produces: five `.editorial-for-techs-faq-card` elements with stable responsive spacing and no `.editorial-faq` class.

- [ ] **Step 1: Write the failing regression test**

Add this test inside the existing `describe("ForTechsPage signup", ...)` block:

```ts
it("gives the Common questions cards deliberate stacked spacing", async () => {
  const view = await renderPage();
  const heading = Array.from(view.container.querySelectorAll("h2")).find(
    (element) => element.textContent?.trim() === "Common questions"
  );
  const section = heading?.closest("section");
  const list = heading?.nextElementSibling;
  const cards = Array.from(section?.querySelectorAll(".editorial-for-techs-faq-card") ?? []);

  expect(heading?.classList.contains("mb-12")).toBe(true);
  expect(list?.classList.contains("space-y-6")).toBe(true);
  expect(cards).toHaveLength(5);
  expect(cards.every((card) => !card.classList.contains("editorial-faq"))).toBe(true);
  expect(cards.every((card) => card.classList.contains("p-7") && card.classList.contains("md:p-8"))).toBe(true);
  expect(cards.every((card) => card.querySelector("h4")?.classList.contains("mb-3"))).toBe(true);
  view.cleanup();
});
```

- [ ] **Step 2: Run the focused test and confirm the intended failure**

Run:

```bash
npm test --workspace @find-my-tech/frontend -- src/pages/__tests__/for-techs-page.test.ts
```

Expected: FAIL because the heading still has `mb-10`, the list still has `space-y-4`, and no `.editorial-for-techs-faq-card` elements exist.

- [ ] **Step 3: Apply the minimal spacing and class-isolation change**

Replace the FAQ section spacing classes with:

```tsx
<h2 className="text-3xl font-bold text-center text-[#150E12] mb-12" style={{ fontFamily: "'Playfair Display', serif" }}>
  Common questions
</h2>
<div className="space-y-6">
  {items.map((item) => (
    <div key={item.q} className="editorial-for-techs-faq-card border border-border p-7 md:p-8">
      <h4 className="editorial-display text-2xl text-foreground mb-3">{item.q}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
    </div>
  ))}
</div>
```

Keep the current inline FAQ array in place; `items` above represents that unchanged mapping expression and is not a new variable.

- [ ] **Step 4: Run focused automated verification**

Run:

```bash
npm test --workspace @find-my-tech/frontend -- src/pages/__tests__/for-techs-page.test.ts
npm run typecheck --workspace @find-my-tech/frontend
```

Expected: the For Techs test file passes with zero failures and TypeScript exits with code 0.

- [ ] **Step 5: Verify the real page at desktop and mobile widths**

Open `http://localhost:3000/for-techs`, reload it, and inspect `Common questions` at the current desktop viewport. Then inspect at approximately 390px wide. Confirm five vertically stacked cards, visible space between heading/cards and question/answer text, square borders, no class-driven two-column squeeze, and no horizontal overflow.

- [ ] **Step 6: Review the final diff**

Run:

```bash
git diff --check -- frontend/src/pages/for-techs-page.tsx frontend/src/pages/__tests__/for-techs-page.test.ts
git diff -- frontend/src/pages/for-techs-page.tsx frontend/src/pages/__tests__/for-techs-page.test.ts
```

Expected: only the For Techs FAQ markup and its focused regression test changed.
