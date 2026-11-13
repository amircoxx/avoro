# Unified Auth Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every login and account-creation overlay use the supplied Muse split-image design.

**Architecture:** Extract the current account overlay’s photographic panel, modal frame, mobile collapse, close control, and alternate-mode control into one presentational `AuthSplitShell`. Keep `AccountAuthModal` and the For Techs `SignupContent` responsible for their existing form state, API calls, role/referral behavior, and onboarding progression.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, happy-dom, Playwright CLI.

## Global Constraints

- Treat the supplied screenshot as the visual source of truth.
- Preserve the existing login, registration, tech-only referral, and profile-publishing contracts.
- Use the shared shell for both auth entry points; do not duplicate the image panel.
- Keep forms scrollable within short viewports and collapse to a form-only mobile overlay.
- Preserve unrelated working-tree changes.

---

### Task 1: Shared split overlay shell

**Files:**
- Create: `frontend/src/components/layout/auth-split-shell.tsx`
- Modify: `frontend/src/components/layout/account-auth-modal.tsx`
- Modify: `frontend/src/pages/for-techs/tech-signup-modal.tsx`
- Test: `frontend/src/pages/__tests__/for-techs-page.test.ts`

**Interfaces:**
- Produces: `AuthSplitShell({ titleId, onClose, alternateAction, children })`.
- Preserves: all auth service calls and callbacks in the owning flows.

- [ ] **Step 1: Add a failing test proving the For Techs overlay uses the split visual shell and top-right mode switch.**
- [ ] **Step 2: Run the focused test and confirm it fails because the old compact modal is still rendered.**
- [ ] **Step 3: Extract the current account overlay frame into `AuthSplitShell` and consume it from both overlays.**
- [ ] **Step 4: Run focused tests and typecheck.**

### Task 2: For Techs form parity

**Files:**
- Modify: `frontend/src/pages/for-techs-page.tsx`
- Modify: `frontend/src/assets/globals.css`
- Test: `frontend/src/pages/__tests__/for-techs-page.test.ts`

**Interfaces:**
- Consumes: the existing `registerUser`, `loginUser`, `saveTechProfile`, and referral state without changing their signatures.
- Produces: screenshot-aligned create/login forms and a scrollable profile-completion step inside the same shell.

- [ ] **Step 1: Remove the old tab/header composition and map the mode switch to the shared top-right action.**
- [ ] **Step 2: Apply the shared heading, field, submit, and switch-copy classes to the tech auth form.**
- [ ] **Step 3: Keep the beta message prominent inside the shared form language and preserve referral reveal behavior.**
- [ ] **Step 4: Verify desktop, short desktop, and mobile layouts with Playwright, then run the full frontend suite and production build.**
