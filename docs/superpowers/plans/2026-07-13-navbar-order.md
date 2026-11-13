# Navbar Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `How It Works` before the role-aware `My Profile` / `For Techs` link in both navbar layouts.

**Architecture:** Reorder only the existing `navLink` calls in the shared `Nav` component. Update its source-contract test to assert the same order in desktop and mobile containers; labels and routes are unchanged.

**Tech Stack:** React, TypeScript, Vitest, Tailwind CSS.

## Global Constraints

- Desktop order is `Discover`, `How It Works`, then `My Profile` for authenticated techs or `For Techs` for everyone else.
- Mobile order is `Discover Artists`, `How It Works`, then the same role-aware tech destination.
- Labels, routes, active-link behavior, and account controls remain unchanged.
- No backend, API, routing, or authentication changes.

---

### Task 1: Reorder the shared navbar links

**Files:**
- Modify: `frontend/src/components/layout/beauty-shell.tsx:76-106`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts:11-23`

**Interfaces:**
- Consumes: `navLink(label, path)`, `techNavLabel`, and `techNavPath`.
- Produces: the same links in the required desktop and mobile order.

- [ ] **Step 1: Write the failing test**

Replace the order assertions with:

```ts
expect(shell).toMatch(/<div className="hidden md:flex items-center gap-7">\s*\{navLink\("Discover", "\/discover"\)\}\s*\{navLink\("How It Works", "\/how-it-works"\)\}\s*\{navLink\(techNavLabel, techNavPath\)\}/);
expect(shell).toMatch(/<div className="md:hidden border-t border-border bg-white px-5 py-4 flex flex-col gap-2">\s*\{navLink\("Discover Artists", "\/discover"\)\}\s*\{navLink\("How It Works", "\/how-it-works"\)\}\s*\{navLink\(techNavLabel, techNavPath\)\}/);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm --prefix frontend test -- beauty-shell-accessibility.test.ts`

Expected: FAIL because both layouts currently render the role-aware tech link before `How It Works`.

- [ ] **Step 3: Implement the reorder**

In both the desktop and mobile navigation containers in `frontend/src/components/layout/beauty-shell.tsx`, put:

```tsx
{navLink("How It Works", "/how-it-works")}
{navLink(techNavLabel, techNavPath)}
```

immediately after the existing Discover link.

- [ ] **Step 4: Run focused and full verification**

Run: `npm --prefix frontend test -- beauty-shell-accessibility.test.ts && npm --prefix frontend test && npm --prefix frontend run typecheck && npm --prefix frontend run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/beauty-shell.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: reorder profile navigation"
```
