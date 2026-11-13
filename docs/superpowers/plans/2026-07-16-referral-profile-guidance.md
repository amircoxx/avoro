# Referral Profile Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dummy referral URL from the For Techs page and direct techs to the My Profile page for their referral code.

**Architecture:** Keep the change inside the existing referral panel in `ForTechsPage`. Use the existing client router for the `/tech-profile` link and protect the customer-facing copy with the current DOM test suite.

**Tech Stack:** React 19, TypeScript, Vitest, happy-dom

## Global Constraints

- Preserve the existing referral panel layout and visual language.
- Do not add backend behavior or referral-code generation.
- Remove `muse.app/join?ref=yourhandle` from shipped UI.

---

### Task 1: Replace dummy referral URL with profile guidance

**Files:**
- Modify: `frontend/src/pages/for-techs-page.tsx:389-406`
- Test: `frontend/src/pages/__tests__/for-techs-page.test.ts`

**Interfaces:**
- Consumes: `useRouter().push(path: string)` already initialized in `ForTechsPage`
- Produces: A visible guidance sentence whose My Profile control routes to `/tech-profile`

- [ ] **Step 1: Write the failing test**

Add a test that renders `ForTechsPage`, verifies `muse.app/join?ref=yourhandle` is absent, verifies the guidance sentence is visible, and clicks `My Profile` to expect `push("/tech-profile")`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @find-my-tech/frontend -- src/pages/__tests__/for-techs-page.test.ts`

Expected: FAIL because the dummy URL is still rendered and no My Profile control exists in the referral panel.

- [ ] **Step 3: Write the minimal implementation**

Remove the dummy URL wrapper and render: `Find your referral code on the My Profile page.` Make `My Profile` a button that calls `router.push("/tech-profile")` while retaining the panel's centered editorial styling.

- [ ] **Step 4: Run focused verification**

Run: `npm test --workspace @find-my-tech/frontend -- src/pages/__tests__/for-techs-page.test.ts`

Expected: The new regression test passes. Report any unrelated pre-existing failures separately.

- [ ] **Step 5: Run the frontend build**

Run: `npm run build --workspace @find-my-tech/frontend`

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 6: Commit when requested**

Stage only the referral panel, its regression test, and this plan, then commit with `fix: replace dummy referral link with profile guidance`.
