# Tech Profile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give authenticated techs a clear `My Profile` navigation destination and an explicit create-profile flow when no profile exists.

**Architecture:** Keep `/tech-profile` as the only editor route. `BeautyShell` selects the tech-specific navigation label from the authenticated role. `TechProfilePage` uses the existing `loadTechProfile()` facade result to choose among loading, no-profile call-to-action, create editor, and edit editor states; the existing save facade and media APIs remain unchanged.

**Tech Stack:** React 19, TypeScript, React Router, Vite, Vitest, Tailwind CSS, Sonner.

## Global Constraints

- Visitors and customer accounts retain the `For Techs` link to `/for-techs`.
- Authenticated techs see `My Profile` in the same desktop and mobile navigation position, linking to `/tech-profile`.
- `/tech-profile` remains protected for authenticated `TECH` users only.
- No new backend endpoint, route, API request, or API contract is introduced.
- The tech-profile facade continues to own profile loading and saving; the page owns visual and React state.
- A missing profile must show a call-to-action before the blank form; the form appears only after the user selects `Create profile`.

---

## File structure

- Modify `frontend/src/components/layout/beauty-shell.tsx`: role-aware desktop/mobile navigation; remove redundant tech editor controls.
- Modify `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`: navigation source-contract test.
- Modify `frontend/src/pages/tech-profile-page.tsx`: profile-presence state, no-profile CTA, and create-mode copy.
- Modify `frontend/src/pages/__tests__/tech-profile-page.test.ts`: source-contract test for the no-profile CTA and mode-specific copy.

### Task 1: Make global navigation tech-aware

**Files:**
- Modify: `frontend/src/components/layout/beauty-shell.tsx:50-145,220-310`
- Test: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Consumes: `AuthUser | null`, including `role: "TECH" | "CUSTOMER"`.
- Produces: desktop and mobile `My Profile` links that call `router.push("/tech-profile")` for signed-in techs.

- [ ] **Step 1: Write the failing test**

Replace the old tech-only editor assertion with:

```ts
expect(shell).toMatch(/const techNavLabel = authUser\?\.role === "TECH" \? "My Profile" : "For Techs";/);
expect(shell).toMatch(/const techNavPath = authUser\?\.role === "TECH" \? "\/tech-profile" : "\/for-techs";/);
expect(shell).toMatch(/navLink\(techNavLabel, techNavPath\)/);
expect(shell).not.toMatch(/Edit my profile/);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm --prefix frontend test -- beauty-shell-accessibility.test.ts`

Expected: FAIL because the navbar currently renders `For Techs` unconditionally and includes `Edit my profile`.

- [ ] **Step 3: Implement the navigation contract**

In `Nav`, before `return`, add:

```ts
const techNavLabel = authUser?.role === "TECH" ? "My Profile" : "For Techs";
const techNavPath = authUser?.role === "TECH" ? "/tech-profile" : "/for-techs";
```

Replace the desktop and mobile `navLink("For Techs", "/for-techs")` calls with `navLink(techNavLabel, techNavPath)`. Remove `onEditProfile` from the `HeaderAuthActions` invocation, prop type, and its tech-only menu item. Remove the mobile tech-only `Edit my profile` button.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm --prefix frontend test -- beauty-shell-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/beauty-shell.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: surface my profile for tech accounts"
```

### Task 2: Add the no-profile create gate

**Files:**
- Modify: `frontend/src/pages/tech-profile-page.tsx:26-131,232-315`
- Test: `frontend/src/pages/__tests__/tech-profile-page.test.ts`

**Interfaces:**
- Consumes: `loadTechProfile(): Promise<OwnerTechProfile | null>`.
- Produces: `hasProfile: boolean | null` and `isCreatingProfile: boolean`. A tech with no profile selects `Create profile` before the editor is shown.

- [ ] **Step 1: Write the failing test**

Add a source-contract test containing:

```ts
expect(source).toMatch(/const \[hasProfile, setHasProfile\] = useState<boolean \| null>\(null\);/);
expect(source).toMatch(/setHasProfile\(Boolean\(profile\)\);/);
expect(source).toMatch(/if \(!isProfileLoading && hasProfile === false && !isCreatingProfile\)/);
expect(source).toMatch(/Create your profile to start getting discovered\./);
expect(source).toMatch(/onClick=\{\(\) => setIsCreatingProfile\(true\)\}/);
expect(source).toMatch(/isCreatingProfile \? "Create your profile" : "Edit your profile"/);
expect(source).toMatch(/isCreatingProfile \? "Create profile" : "Save profile"/);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm --prefix frontend test -- tech-profile-page.test.ts`

Expected: FAIL because the page currently has no no-profile state and always uses edit-mode copy.

- [ ] **Step 3: Implement the create gate and mode copy**

Add state beside the existing loading state:

```ts
const [hasProfile, setHasProfile] = useState<boolean | null>(null);
const [isCreatingProfile, setIsCreatingProfile] = useState(false);
```

In the `loadTechProfile()` success handler, set presence before the profile mapping guard:

```ts
setHasProfile(Boolean(profile));
if (!isMounted || !profile) return;
```

Before the existing editor return, render this state when `!isProfileLoading && hasProfile === false && !isCreatingProfile`:

```tsx
<main className="min-h-[calc(100vh-4rem)] bg-[#FDF7F4] px-5 py-10 sm:py-14">
  <section className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-8 text-center shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-widest text-rose-700">My profile</p>
    <h1 className="mt-3 text-3xl font-bold text-foreground">Create your profile</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Create your profile to start getting discovered.</p>
    <button type="button" onClick={() => setIsCreatingProfile(true)}>Create profile</button>
  </section>
</main>
```

Use `isCreatingProfile ? "Create your profile" : "Edit your profile"` for the editor heading, create-specific supporting text, and `isCreatingProfile ? "Create profile" : "Save profile"` for the submit button. After a successful save, call `setHasProfile(true)` and `setIsCreatingProfile(false)` before showing the success toast.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm --prefix frontend test -- tech-profile-page.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tech-profile-page.tsx frontend/src/pages/__tests__/tech-profile-page.test.ts
git commit -m "feat: guide techs to create missing profiles"
```

### Task 3: Verify the complete frontend contract

**Files:**
- Verify: the four Task 1 and Task 2 files.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: type-safe, production-buildable frontend behavior with coverage for role-aware navigation and the missing-profile entry state.

- [ ] **Step 1: Run focused tests**

Run: `npm --prefix frontend test -- beauty-shell-accessibility.test.ts tech-profile-page.test.ts`

Expected: PASS.

- [ ] **Step 2: Run all frontend tests**

Run: `npm --prefix frontend test`

Expected: PASS.

- [ ] **Step 3: Run static and production verification**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run build`

Expected: both commands exit 0 and Vite emits a production build.

- [ ] **Step 4: Inspect final changes**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional files changed.

- [ ] **Step 5: Commit only if verification required a correction**

If a source correction was needed after the Task 1 or Task 2 commits:

```bash
git add frontend/src/components/layout/beauty-shell.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts frontend/src/pages/tech-profile-page.tsx frontend/src/pages/__tests__/tech-profile-page.test.ts
git commit -m "fix: verify tech profile navigation"
```

Otherwise, do not create an empty commit.

