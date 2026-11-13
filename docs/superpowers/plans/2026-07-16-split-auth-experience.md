# Split Auth Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the supplied split-image login design for Muse login and account creation while preserving the existing authentication behavior.

**Architecture:** Keep `AccountAuthModal` as the single auth entry point and retain its existing API calls, role selection, referral handling, toast feedback, and callbacks. Reshape only its markup and add narrowly prefixed `muse-auth` styles so the desktop dialog becomes a near-full-screen visual/form split and the mobile dialog collapses to the form panel.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, happy-dom, Vite.

## Global Constraints

- Treat the supplied screenshot as the visual source of truth.
- Preserve the existing login, registration, role, referral-code, and callback contracts.
- Hide the photographic panel on compact screens and keep the form independently scrollable.
- Preserve visible focus states, semantic labels, and reduced-motion behavior.
- Do not modify unrelated dirty files.

---

### Task 1: Screenshot-faithful auth dialog

**Files:**
- Modify: `frontend/src/components/layout/account-auth-modal.tsx`
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Consumes: `loginUser`, `registerUser`, `savePendingReferralCode`, and `onAuthenticated` exactly as currently defined.
- Produces: One responsive `AccountAuthModal` supporting `login` and `register` modes.

- [ ] **Step 1: Write the failing regression test**

Assert that opening Create account renders the split auth shell and creation heading, then switch the dialog to login and assert the login heading.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test --workspace @find-my-tech/frontend -- frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: FAIL because the `muse-auth` split layout and new visible headings do not exist yet.

- [ ] **Step 3: Implement the modal markup and isolated styles**

Use a photographic beauty-work panel with a low black gradient and Muse-specific copy on desktop. Use a clean white form panel, top-right mode switch, full-width fields, password visibility control, restrained divider, and a single dark primary action. Keep register-only full name, account type, and tech referral controls.

- [ ] **Step 4: Run focused and complete verification**

Run the focused Vitest file, frontend typecheck, frontend build, and repository test suite. Then verify both auth modes in a browser at desktop and mobile viewport sizes.

