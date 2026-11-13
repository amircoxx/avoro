# Repo-Wide Readability Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend and backend easier for a first-time contributor to trace while preserving all UI, URL, API, session, and database behavior.

**Architecture:** Keep the established frontend page → facade → API-module path and backend route → controller → service → Prisma-model path. Extract only cohesive, colocated view modules and pure domain helpers; preserve public imports with short compatibility re-exports where a safe incremental migration needs one.

**Tech Stack:** React 18, TypeScript, React Router, Vite, Vitest, Express, Prisma, Zod, PostgreSQL.

## Global Constraints

- Preserve existing client URLs, HTTP request/response shapes, session cookie semantics, Prisma schema, and rendered copy/interaction behavior.
- Do not introduce new dependencies, framework layers, state libraries, migrations, or generic catch-all folders.
- Every extraction has one explicit owner and must not add browser `fetch` calls outside `frontend/src/services/api`.
- Remove a file/export only after `rg` proves it has no production or test consumers and the focused test/typecheck passes.
- Preserve the unrelated modified `.playwright-cli/console-2026-07-13T23-42-52-451Z.log` file.

---

## File Structure

| Path | Responsibility after cleanup |
| --- | --- |
| `frontend/src/components/layout/beauty-shell.tsx` | Shell composition only: toaster, header, routed children, footer. |
| `frontend/src/components/layout/site-header.tsx` | Navigation state, account-session loading, and modal orchestration. |
| `frontend/src/components/layout/account-auth-modal.tsx` | Login/register form and pending referral persistence. |
| `frontend/src/components/layout/account-settings-modal.tsx` | Account-details form and account facade update flow. |
| `frontend/src/components/layout/site-footer.tsx` | Footer navigation and informational actions. |
| `frontend/src/pages/discover-page.tsx` | Discover route state and composition. |
| `frontend/src/pages/discover/` | Discover filter controls, result sections, and parsing/view helpers, each local to the route. |
| `frontend/src/pages/artist-profile/` | Profile header/contact, tab panels, review form, and route-local presentation types. |
| `frontend/src/pages/for-techs/` | Marketing sections and the tech onboarding modal/form. |
| `frontend/src/pages/tech-profile/` | Owner editor state helpers and presentation sections while the route retains save/load orchestration. |
| `backend/src/services/profile-media/` | Private media persistence and media mapping helpers, with a stable public service entry point if imports require it. |
| `backend/src/services/tech-profile/` | Private profile persistence/read helpers, with a stable public service entry point if imports require it. |
| `backend/src/services/marketplace-shared.ts` | Only query includes and mapping helpers shared by more than one service. |
| `docs/architecture.md` | First-contributor starting points, ownership, and real request-flow examples. |

### Task 1: Protect current behavior with focused characterization coverage

**Files:**
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`
- Modify: `frontend/src/pages/__tests__/discover-page.test.ts`
- Modify: `frontend/src/pages/__tests__/artist-profile-page.test.ts`
- Modify: `frontend/src/pages/__tests__/for-techs-page.test.ts`
- Modify: `frontend/src/pages/__tests__/tech-profile-page.test.ts`
- Modify: `backend/src/services/__tests__/profile-media.test.ts`
- Modify: `backend/src/services/__tests__/referrals.test.ts`

**Interfaces:**
- Consumes: existing routes, facades, service exports, and visible labels.
- Produces: regression coverage that proves the public behavior before modules move.

- [ ] **Step 1: Add a focused failing shell characterization test**

```ts
it("keeps the role-aware navigation and account entry points available", async () => {
  render(<BeautyShell><div>Route body</div></BeautyShell>);

  expect(await screen.findByRole("button", { name: "Create account" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Discover" })).toBeVisible();
});
```

- [ ] **Step 2: Run the shell test and confirm the baseline behavior passes**

Run: `npm run test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: PASS against the current behavior; this establishes the regression baseline before extraction.

- [ ] **Step 3: Add only behavior-level assertions for each extraction boundary**

Add tests that observe the existing search/filter/saved state, artist tabs and review submit control, tech onboarding controls, owner-editor loading/dirty-save state, media grouping, and referral validation. Do not assert private file names or component internals.

```ts
expect(screen.getByRole("button", { name: /portfolio/i })).toBeVisible();
expect(screen.getByRole("button", { name: /save changes/i })).toBeVisible();
expect(groupProfileMedia(media).galleryImages).toHaveLength(1);
```

- [ ] **Step 4: Run the focused frontend and backend test files**

Run: `npm run test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/beauty-shell-accessibility.test.ts src/pages/__tests__/discover-page.test.ts src/pages/__tests__/artist-profile-page.test.ts src/pages/__tests__/for-techs-page.test.ts src/pages/__tests__/tech-profile-page.test.ts`

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/profile-media.test.ts src/services/__tests__/referrals.test.ts`

Expected: PASS before any production module is moved.

- [ ] **Step 5: Commit the characterization coverage**

```bash
git add frontend/src/components/layout/__tests__ frontend/src/pages/__tests__ backend/src/services/__tests__
git commit -m "test: characterize readability cleanup boundaries"
```

### Task 2: Split the shared application shell by user-facing responsibility

**Files:**
- Create: `frontend/src/components/layout/site-header.tsx`
- Create: `frontend/src/components/layout/account-auth-modal.tsx`
- Create: `frontend/src/components/layout/account-settings-modal.tsx`
- Create: `frontend/src/components/layout/account-text-field.tsx`
- Create: `frontend/src/components/layout/site-footer.tsx`
- Modify: `frontend/src/components/layout/beauty-shell.tsx`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Consumes: `AuthUser`, `loadAccountSession`, `updateAccountDetails`, auth API calls, `SavedTechsModal`, router hooks, and `sonner`.
- Produces: `SiteHeader`, `AccountAuthModal`, `AccountSettingsModal`, and `SiteFooter`; `BeautyShell` remains the default shell export.

- [ ] **Step 1: Add a failing import-safe shell test for modal behavior**

```ts
await user.click(screen.getByRole("button", { name: "Create account" }));
expect(await screen.findByRole("dialog")).toBeVisible();
```

- [ ] **Step 2: Run it and verify the failure is about the absent dialog semantics, not setup**

Run: `npm run test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: FAIL until the existing auth modal exposes the tested behavior.

- [ ] **Step 3: Extract existing JSX and state without changing behavior**

Move `Nav` into `SiteHeader`, `AccountAuthModal` into its named module, `AccountSettingsModal` into its named module, `AuthTextField` into `account-text-field.tsx`, and `Footer` into `SiteFooter`. Keep callback contracts explicit:

```ts
export function SiteHeader(): JSX.Element;
export function AccountAuthModal(props: {
  initialMode: "login" | "register";
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}): JSX.Element;
```

Reduce `beauty-shell.tsx` to composition:

```tsx
<Toaster position="top-center" richColors />
<SiteHeader />
{children}
<SiteFooter />
```

- [ ] **Step 4: Add dialog roles/labels only where the characterization test exposed a missing accessible contract**

Keep form labels, click behavior, and toast messages unchanged. Do not redesign navigation or auth flow.

- [ ] **Step 5: Run focused tests plus frontend typecheck**

Run: `npm run test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Run: `npm run typecheck --workspace @find-my-tech/frontend`

Expected: PASS.

- [ ] **Step 6: Commit the shell extraction**

```bash
git add frontend/src/components/layout
git commit -m "refactor: separate application shell responsibilities"
```

### Task 3: Decompose route-level frontend presentation while retaining route workflow ownership

**Files:**
- Create: `frontend/src/pages/discover/discover-filters.tsx`
- Create: `frontend/src/pages/discover/discover-results.tsx`
- Create: `frontend/src/pages/discover/discover-location.ts`
- Modify: `frontend/src/pages/discover-page.tsx`
- Create: `frontend/src/pages/artist-profile/profile-contact.tsx`
- Create: `frontend/src/pages/artist-profile/profile-tabs.tsx`
- Create: `frontend/src/pages/artist-profile/review-form.tsx`
- Modify: `frontend/src/pages/artist-profile-page.tsx`
- Create: `frontend/src/pages/for-techs/tech-signup-modal.tsx`
- Create: `frontend/src/pages/for-techs/marketing-sections.tsx`
- Modify: `frontend/src/pages/for-techs-page.tsx`
- Modify: `frontend/src/pages/__tests__/discover-page.test.ts`
- Modify: `frontend/src/pages/__tests__/artist-profile-page.test.ts`
- Modify: `frontend/src/pages/__tests__/for-techs-page.test.ts`

**Interfaces:**
- Consumes: route-owned state/actions and existing facade/API types.
- Produces: display components with typed props; pages keep effects, routing, facade calls, toasts, and mutation state.

- [ ] **Step 1: Add a failing rendering test per route section before each extraction**

```ts
expect(screen.getByRole("button", { name: /under \$60/i })).toBeVisible();
expect(screen.getByRole("tab", { name: /services/i })).toBeVisible();
expect(screen.getByRole("button", { name: /join muse/i })).toBeVisible();
```

- [ ] **Step 2: Run each page test to confirm the new assertion fails for the intended missing coverage**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/__tests__/discover-page.test.ts src/pages/__tests__/artist-profile-page.test.ts src/pages/__tests__/for-techs-page.test.ts`

Expected: FAIL only for the newly added assertions.

- [ ] **Step 3: Extract presentational sections with explicit prop contracts**

Examples of target contracts:

```ts
export function DiscoverFilters(props: {
  query: string;
  location: string;
  selectedPriceRanges: PriceRangeFilter[];
  onQueryChange: (value: string) => void;
  onSearch: () => void;
}): JSX.Element;

export function ProfileTabs(props: {
  activeTab: "portfolio" | "services" | "reviews";
  onTabChange: (tab: "portfolio" | "services" | "reviews") => void;
  artist: Artist;
}): JSX.Element;
```

Move `parseTypedLocation` to `discover/discover-location.ts` as a named pure function and test it through the route behavior or a focused unit test. Do not move effects, `searchArtists`, `toggleSavedTech`, profile loading, review submission, registration, or profile saving from the page modules.

- [ ] **Step 4: Remove duplicated imports and dead local helpers created by the extraction**

Run `rg -n "parseTypedLocation|SignupModal|TextField" frontend/src` and remove only the prior definitions with zero remaining references.

- [ ] **Step 5: Run focused route tests and frontend typecheck**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/__tests__/discover-page.test.ts src/pages/__tests__/artist-profile-page.test.ts src/pages/__tests__/for-techs-page.test.ts`

Run: `npm run typecheck --workspace @find-my-tech/frontend`

Expected: PASS.

- [ ] **Step 6: Commit the route presentation extraction**

```bash
git add frontend/src/pages
git commit -m "refactor: isolate route presentation sections"
```

### Task 4: Make the owner tech-profile editor traceable by separating pure draft helpers and visible sections

**Files:**
- Create: `frontend/src/pages/tech-profile/editor-state.ts`
- Create: `frontend/src/pages/tech-profile/tech-profile-loading-state.tsx`
- Create: `frontend/src/pages/tech-profile/tech-profile-empty-state.tsx`
- Create: `frontend/src/pages/tech-profile/tech-profile-editor-header.tsx`
- Modify: `frontend/src/pages/tech-profile-page.tsx`
- Modify: `frontend/src/pages/__tests__/tech-profile-page.test.ts`
- Modify: `frontend/src/components/layout/profile-media-draft.ts`
- Modify: `frontend/src/components/layout/__tests__/profile-media-draft.test.ts`

**Interfaces:**
- Consumes: existing media draft operations, profile facade workflow, router blocker, and owner profile types.
- Produces: pure `isTechProfileDirty` and object-URL revoke helpers plus display-only page sections; `TechProfilePage` retains network and save orchestration.

- [ ] **Step 1: Add failing pure-helper and page-state tests**

```ts
expect(isTechProfileDirty(savedForm, savedLocation, savedDraft, savedForm, savedLocation, savedDraft)).toBe(false);
expect(screen.getByRole("button", { name: /create profile/i })).toBeVisible();
```

- [ ] **Step 2: Run the targeted tests and confirm a red result**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/__tests__/tech-profile-page.test.ts src/components/layout/__tests__/profile-media-draft.test.ts`

Expected: FAIL because the named helper or explicit state coverage is absent.

- [ ] **Step 3: Extract only pure comparison/cleanup helpers and view-only state components**

Move `shouldSaveTechProfile`, object-URL revocation, and media role labels into `editor-state.ts` with named exports. Move the loading, missing-profile, and page header JSX into the named components. Preserve all `useEffect`, mutation, retry, upload/delete checkpoint, unsaved-navigation, and `saveTechProfileWorkflow` behavior in `tech-profile-page.tsx`.

```ts
export function isTechProfileDirty(
  form: TechOnboardingForm,
  location: LocationSuggestion | null,
  draft: ProfileMediaDraft,
  savedForm: TechOnboardingForm,
  savedLocation: LocationSuggestion | null,
  savedDraft: Pick<ProfileMediaDraft, "pendingUploads" | "removedMediaIds">
): boolean;
```

- [ ] **Step 4: Run targeted tests and frontend typecheck**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/__tests__/tech-profile-page.test.ts src/components/layout/__tests__/profile-media-draft.test.ts`

Run: `npm run typecheck --workspace @find-my-tech/frontend`

Expected: PASS.

- [ ] **Step 5: Commit the owner-editor cleanup**

```bash
git add frontend/src/pages/tech-profile frontend/src/pages/tech-profile-page.tsx frontend/src/components/layout/profile-media-draft.ts frontend/src/pages/__tests__/tech-profile-page.test.ts frontend/src/components/layout/__tests__/profile-media-draft.test.ts
git commit -m "refactor: clarify tech profile editor state"
```

### Task 5: Clarify backend service internals without altering route/controller contracts

**Files:**
- Create: `backend/src/services/profile-media/profile-media.mapper.ts`
- Create: `backend/src/services/profile-media/profile-media.repository.ts`
- Create: `backend/src/services/profile-media/profile-media.service.ts`
- Modify: `backend/src/services/profile-media.service.ts`
- Create: `backend/src/services/tech-profile/tech-profile.repository.ts`
- Create: `backend/src/services/tech-profile/tech-profile.mapper.ts`
- Create: `backend/src/services/tech-profile/tech-profile.service.ts`
- Modify: `backend/src/services/tech-profile.service.ts`
- Modify: `backend/src/services/marketplace-shared.ts`
- Modify: `backend/src/services/README.md`
- Modify: `backend/src/services/__tests__/profile-media.test.ts`
- Modify: `backend/src/services/__tests__/referrals.test.ts`
- Modify: `backend/src/__tests__/profile-media.api.test.ts`

**Interfaces:**
- Consumes: all existing controller imports from `*.service.ts`, Prisma transaction clients, schemas, and `AppError`.
- Produces: unchanged exports from `profile-media.service.ts` and `tech-profile.service.ts`; focused private helpers for mapping and query persistence.

- [ ] **Step 1: Add a failing mapper characterization test**

```ts
expect(toProfileMediaDto(media)).toEqual({
  id: media.id,
  imageUrl: media.imageDataUrl,
  altText: media.altText,
  sortOrder: media.sortOrder
});
```

- [ ] **Step 2: Run backend media/referral/API tests and verify the test is red for the intended missing export or behavior**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/profile-media.test.ts src/services/__tests__/referrals.test.ts src/__tests__/profile-media.api.test.ts`

Expected: FAIL only for the new mapper characterization.

- [ ] **Step 3: Extract private helpers behind stable service entry points**

Move media DTO/grouping functions to `profile-media.mapper.ts` and transaction-scoped loading/reindexing to `profile-media.repository.ts`. Move single-service tech-profile Prisma persistence/read functions to `tech-profile.repository.ts` and owner/public DTO construction to `tech-profile.mapper.ts` only if that avoids duplicating mapping already shared through `marketplace-shared.ts`.

Keep controller-facing exports unchanged:

```ts
export { deleteProfileMedia, saveProfileMedia } from "./profile-media/profile-media.service";
export { getPublicTechProfile, getTechProfileForUser, upsertTechProfile } from "./tech-profile/tech-profile.service";
```

If a helper is used by multiple services, keep it in `marketplace-shared.ts`; otherwise make it private to the owning domain folder. Do not move `AppError` rules, session behavior, or referral rules merely for symmetry.

- [ ] **Step 4: Update the service README with an ownership map and stable-import rule**

Document the exact rule: controllers import only `*.service.ts`; cross-domain helpers are permitted only from `marketplace-shared.ts`; domain-internal files may not be imported by controllers.

- [ ] **Step 5: Run backend focused tests, all backend tests, and typecheck**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/profile-media.test.ts src/services/__tests__/referrals.test.ts src/__tests__/profile-media.api.test.ts`

Run: `npm run test --workspace @find-my-tech/backend`

Run: `npm run typecheck --workspace @find-my-tech/backend`

Expected: PASS with the same API controller behavior.

- [ ] **Step 6: Commit the backend cleanup**

```bash
git add backend/src/services backend/src/__tests__/profile-media.api.test.ts
git commit -m "refactor: clarify backend service boundaries"
```

### Task 6: Publish onboarding documentation and complete an evidence-backed dead-code audit

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `frontend/src/services/api/README.md`
- Modify: `backend/src/services/README.md`
- Delete: only files/exports proven unused during the audit
- Modify: tests that import a removed item, only when the test proves no supported behavior

**Interfaces:**
- Consumes: the final source layout and `rg` reference evidence.
- Produces: an accurate starting path for contributors and no unsupported stale modules.

- [ ] **Step 1: Add a failing documentation consistency check only if an existing docs test harness is available**

If no documentation test harness exists, record the manual check in the PR/commit notes rather than adding a dependency or a brittle snapshot test.

```sh
rg -n "beauty-shell|profile-media\.service|tech-profile\.service" README.md docs frontend/src/services/api/README.md backend/src/services/README.md
```

- [ ] **Step 2: Update onboarding docs with concrete tracing examples**

Add: (1) a five-minute reading order, (2) the direct flow from Discover search to `tech-search.service.ts`, (3) the owner profile save flow to `tech-profile.service.ts`, (4) where shared UI versus page-local sections belong, and (5) the controller-facing stable service import rule.

- [ ] **Step 3: Audit candidate dead code with references before deletion**

For every candidate, run all of these before removal:

```sh
rg -n "<candidate export or file basename>" frontend backend README.md docs
npm run typecheck --workspaces --if-present
npm run test --workspaces --if-present
```

Delete only candidates with no production/test references and no documented compatibility purpose. Do not delete `frontend/src/services/api.ts` because it is a documented compatibility entry point.

- [ ] **Step 4: Run the full validation suite and inspect the diff**

Run: `npm run typecheck --workspaces --if-present`

Run: `npm run test --workspaces --if-present`

Run: `npm run build`

Run: `git diff --check`

Run: `git status --short`

Expected: all commands pass; the only unrelated modification remains `.playwright-cli/console-2026-07-13T23-42-52-451Z.log`.

- [ ] **Step 5: Commit documentation and verified removals**

```bash
git add README.md docs/architecture.md frontend/src/services/api/README.md backend/src/services/README.md frontend backend
git commit -m "docs: document codebase ownership"
```
