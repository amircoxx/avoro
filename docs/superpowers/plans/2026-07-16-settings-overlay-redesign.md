# Settings Overlay Redesign Implementation Plan

**Goal:** Reshape the account settings modal into a responsive settings workspace inspired by the supplied reference while preserving Muse's editorial theme and existing account behavior.

**Architecture:** Keep account state and submission inside `AccountSettingsModal`. Add semantic layout classes for the overlay, navigation rail, content header, account summary, form rows, and action bar; style those classes in the shared editorial stylesheet with a single-column mobile breakpoint.

**Tech Stack:** React 19, TypeScript, Tailwind utilities, shared CSS, Vitest, happy-dom.

## Global Constraints

- Preserve `updateAccountDetails`, `onUpdated`, `onClose`, toast, and role behavior.
- Do not add unsupported settings or backend work.
- Retain dialog labeling and keyboard focus visibility.
- Match the website's ivory, paper, ink, stone, and taupe tokens rather than copying the reference's dark palette.

### Task 1: Lock the responsive settings structure with a failing test

**Files:**
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`
- Test: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

- [x] Add source assertions for `muse-settings`, its navigation rail, active General item, content pane, account summary, and action bar.
- [x] Run the focused test and confirm it fails because the new structure is absent.

### Task 2: Implement the reference-aligned overlay

**Files:**
- Modify: `frontend/src/components/layout/account-settings-modal.tsx`
- Modify: `frontend/src/assets/globals.css`

- [x] Replace the compact card composition with the semantic rail/content layout while leaving state and submission unchanged.
- [x] Add desktop and mobile CSS using only the established editorial tokens.
- [x] Run the focused test and confirm it passes.

### Task 3: Verify behavior and presentation

**Files:**
- No production files expected.

- [ ] Run frontend typecheck, tests, and build.
- [x] Start the existing app and inspect the settings overlay at desktop and mobile sizes.
- [x] Verify close, cancel, field editing, overflow, and save-path behavior.
