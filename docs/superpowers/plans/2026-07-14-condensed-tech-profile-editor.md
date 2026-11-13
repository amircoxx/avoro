# Condensed Tech Profile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/tech-profile` into a compact profile-first editor with in-place media actions and a details-editing modal that saves all staged changes together.

**Architecture:** `TechProfilePage` remains the owner of profile form state, media draft state, validation, save sequencing, and unsaved-change protection. `TechProfilePreview` gains optional owner editing controls for the avatar, cover, and gallery, while a focused `TechProfileDetailsModal` renders the existing non-media form inputs against that same page state. No backend, API, or draft-model contract changes are needed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, lucide-react, Vite, Vitest, happy-dom.

## Global Constraints

- Preserve one Save profile workflow: profile details and all staged media changes persist together.
- Retain separate `profile`, `background`, and `gallery` roles, the existing JPEG/PNG/WebP type restriction, 10 MiB client limit, and 12-image gallery limit.
- Keep gallery display sorted by `sortOrder`; the API remains authoritative when concurrent changes make the gallery full.
- Do not change backend schema, endpoints, upload API contract, or `profile-media-draft.ts` behavior.
- Preserve existing TECH-only route protection, loading/error/create states, toasts, and unsaved-navigation behavior.
- Use accessible icon controls with labels, keyboard access, visible focus styling, and disabled behavior during Save.

---

## File Structure

- Modify `frontend/src/components/layout/tech-profile-preview.tsx`: add an optional owner-editing interface, hidden file inputs, avatar/cover pencil controls, gallery add tile, and gallery remove controls.
- Create `frontend/src/components/layout/tech-profile-details-modal.tsx`: render the existing non-media fields in a reusable accessible modal, controlled by page state.
- Modify `frontend/src/pages/tech-profile-page.tsx`: remove the side panel, open/close the modal, pass media callbacks into the preview, retain the save function, and restore focus to the edit trigger after modal close.
- Delete `frontend/src/components/layout/profile-media-editor.tsx`: its side-panel-only rendering is superseded by inline controls.
- Modify `frontend/src/components/layout/__tests__/tech-profile-preview.test.tsx`: cover owner controls, gallery add placement/order, and removal callback forwarding.
- Create `frontend/src/components/layout/__tests__/tech-profile-details-modal.test.tsx`: cover dialog semantics, field forwarding, escape/close behavior, and save submission.
- Modify `frontend/src/pages/__tests__/tech-profile-page.test.ts`: replace obsolete two-column/sidebar assertions with modal and page-level shared-save assertions.
- Delete `frontend/src/components/layout/__tests__/profile-media-editor.test.tsx`: its sidebar-specific behavior moves to preview interaction tests.

### Task 1: Specify and test editable profile-surface controls

**Files:**
- Modify: `frontend/src/components/layout/tech-profile-preview.tsx`
- Modify: `frontend/src/components/layout/__tests__/tech-profile-preview.test.tsx`

**Interfaces:**
- Consumes: `TechProfileMedia`, `ProfileMediaRole`, and `ProfileMedia` from the existing API/draft contracts.
- Produces: optional `editing` prop on `TechProfilePreview`:

```ts
type TechProfilePreviewEditing = {
  disabled: boolean;
  onAdd: (file: File, role: ProfileMediaRole) => void;
  onRemove: (mediaId: string) => void;
  onEditDetails: () => void;
};
```

- Later consumers: `TechProfilePage` passes `editing={{ disabled: isSaving, onAdd: handleAddMedia, onRemove: handleRemoveMedia, onEditDetails: () => setIsDetailsModalOpen(true) }}`.

- [ ] **Step 1: Write failing interaction tests for the editable preview**

Add happy-dom tests that render `TechProfilePreview` with an `editing` object and assert the following contract:

```tsx
const onAdd = vi.fn();
const onRemove = vi.fn();
const view = await renderPreview({ editing: { disabled: false, onAdd, onRemove } });

expect(view.container.querySelector("button[aria-label='Change profile picture']")).not.toBeNull();
expect(view.container.querySelector("button[aria-label='Change background image']")).not.toBeNull();
expect(view.container.querySelector("button[aria-label='Add portfolio photo']")).not.toBeNull();
expect(view.container.querySelector("button[aria-label='Remove portfolio photo 1']")).not.toBeNull();
```

Dispatch a `change` event on the profile input with a PNG `File` and assert `onAdd(file, "profile")`; click the first removal button and assert `onRemove("gallery-draft")`. Assert the gallery `+` tile appears after the images and no add button is rendered for twelve gallery images.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/components/layout/__tests__/tech-profile-preview.test.tsx`

Expected: FAIL because `TechProfilePreview` has no `editing` prop or owner media controls.

- [ ] **Step 3: Implement optional controlled media actions in the preview**

Add `Pencil`, `Plus`, and `X` imports and define the editing type. Extend the component props and keep the public preview unchanged when `editing` is omitted:

```tsx
type TechProfilePreviewProps = {
  // existing props
  editing?: TechProfilePreviewEditing;
};

const profileInput = useRef<HTMLInputElement>(null);
const backgroundInput = useRef<HTMLInputElement>(null);
const galleryInput = useRef<HTMLInputElement>(null);

function selectMedia(event: ChangeEvent<HTMLInputElement>, role: ProfileMediaRole) {
  const file = event.currentTarget.files?.[0];
  if (file) editing?.onAdd(file, role);
  event.currentTarget.value = "";
}
```

Render visually positioned, `type="button"` pencil controls within the profile image and cover containers. Render three visually-hidden inputs only when `editing` exists. Wrap each gallery image in a `group relative` container and render a focus-visible `X` button with `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`. Render the square plus tile after the ordered gallery list unless `galleryImages.length >= 12`; disable all controls while `editing.disabled` is true. Use `aria-label` values exactly as covered by the tests.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --run src/components/layout/__tests__/tech-profile-preview.test.tsx`

Expected: PASS, including the existing public-preview assertions and the new owner-control interaction tests.

- [ ] **Step 5: Commit the independently tested preview controls**

```bash
git add frontend/src/components/layout/tech-profile-preview.tsx frontend/src/components/layout/__tests__/tech-profile-preview.test.tsx
git commit -m "feat: add inline tech profile media controls"
```

### Task 2: Extract the profile-details modal

**Files:**
- Create: `frontend/src/components/layout/tech-profile-details-modal.tsx`
- Create: `frontend/src/components/layout/__tests__/tech-profile-details-modal.test.tsx`

**Interfaces:**
- Consumes: `TechOnboardingForm`, `LocationSuggestion`, `LocationAutocomplete`, and the existing field styling from `TechProfilePage`.
- Produces:

```ts
type TechProfileDetailsModalProps = {
  form: TechOnboardingForm;
  location: LocationSuggestion | null;
  isSaving: boolean;
  onChange: (next: TechOnboardingForm) => void;
  onLocationChange: (next: LocationSuggestion | null) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};
```

- Later consumers: `TechProfilePage` conditionally renders this component and forwards its existing `handleSubmit` function.

- [ ] **Step 1: Write failing modal behavior tests**

Create tests that mount the modal and require its accessible dialog contract and event forwarding:

```tsx
expect(view.container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
expect(view.container.querySelector("#tech-profile-details-title")?.textContent).toContain("Edit profile");

const businessName = view.container.querySelector<HTMLInputElement>('input[aria-label="Business name"]');
await act(async () => businessName?.dispatchEvent(new Event("input", { bubbles: true })));
expect(onChange).toHaveBeenCalled();

await act(async () => view.window.dispatchEvent(new view.window.KeyboardEvent("keydown", { key: "Escape" })));
expect(onClose).toHaveBeenCalledTimes(1);
```

Also assert that Cancel and the close icon call `onClose`, that Save submits `onSave`, and that all controls are disabled while saving.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/components/layout/__tests__/tech-profile-details-modal.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the controlled, scrollable modal**

Create the modal with the existing modal shell convention:

```tsx
<div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
  <button type="button" className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close profile editor" onClick={onClose} />
  <section role="dialog" aria-modal="true" aria-labelledby="tech-profile-details-title" className="relative my-4 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
    {/* title, close button, controlled form */}
  </section>
</div>
```

Move all non-media fields from the page into this controlled form. Keep their labels, placeholders, `LocationAutocomplete`, and the publish checkbox. Add an effect that registers Escape while mounted and focuses the dialog heading or first field on open. Keep the form body `max-h-[calc(100vh-12rem)] overflow-y-auto`, with Cancel and `Save profile` in a footer. Do not create a duplicate form state or call persistence from the modal.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --run src/components/layout/__tests__/tech-profile-details-modal.test.tsx`

Expected: PASS for dialog semantics, controlled updates, close paths, and disabled Save state.

- [ ] **Step 5: Commit the independently tested modal**

```bash
git add frontend/src/components/layout/tech-profile-details-modal.tsx frontend/src/components/layout/__tests__/tech-profile-details-modal.test.tsx
git commit -m "feat: add tech profile details modal"
```

### Task 3: Compose the condensed owner editor and preserve shared save semantics

**Files:**
- Modify: `frontend/src/pages/tech-profile-page.tsx`
- Modify: `frontend/src/pages/__tests__/tech-profile-page.test.ts`
- Delete: `frontend/src/components/layout/profile-media-editor.tsx`
- Delete: `frontend/src/components/layout/__tests__/profile-media-editor.test.tsx`

**Interfaces:**
- Consumes: `TechProfilePreview` with `editing`, `TechProfileDetailsModal`, existing `handleSubmit`, `handleAddMedia`, `handleRemoveMedia`, and `ProfileMediaDraft` helpers.
- Produces: a single-column owner surface with modal editing and one shared persistence action.

- [ ] **Step 1: Write failing page composition tests**

Replace sidebar-specific source assertions with behavior tests that load an existing TECH profile and assert:

```tsx
expect(view.container.textContent).toContain("My profile");
expect(view.container.querySelector("button[aria-label='Edit profile']")).not.toBeNull();
expect(view.container.querySelector("form")).toBeNull();

await act(async () => editButton?.click());
expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();

const saveForm = view.container.querySelector('[role="dialog"] form');
act(() => saveForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
expect(saveTechProfileWorkflow).toHaveBeenCalledTimes(1);
```

Add a page-level test that invokes a preview gallery remove button, opens the modal, and saves; mock `removeProfileMedia` and verify it receives the queued media ID as part of the existing save loop.

- [ ] **Step 2: Run the focused page test to verify it fails**

Run: `npm test -- --run src/pages/__tests__/tech-profile-page.test.ts`

Expected: FAIL because the current page still renders the two-column form and `ProfileMediaEditor`.

- [ ] **Step 3: Replace the two-column side panel with the owner profile surface**

Remove the `ProfileMediaEditor` import and form JSX from `TechProfilePage`. Add `isDetailsModalOpen` state and an edit-button ref. Compose the page around one preview and one modal:

```tsx
<TechProfilePreview
  form={techForm}
  location={techLocation}
  media={mediaDraft.preview}
  rating={0}
  reviewCount={0}
  referralCode={referralCode}
  editing={{ disabled: isSaving, onAdd: handleAddMedia, onRemove: handleRemoveMedia }}
/>
{isDetailsModalOpen ? (
  <TechProfileDetailsModal
    form={techForm}
    location={techLocation}
    isSaving={isSaving}
    onChange={setTechForm}
    onLocationChange={setTechLocation}
    onClose={() => setIsDetailsModalOpen(false)}
    onSave={handleSubmit}
  />
) : null}
```

Put `Edit profile` inside the owner profile card through a new optional preview `onEditDetails` callback, rather than rendering a detached toolbar. On modal close, focus the triggering button with `editButtonRef.current?.focus()`. Preserve `handleSubmit` unchanged so it continues to save the form first, remove queued persisted images, upload pending images, reset the draft, refresh, and toast success once.

Delete the old media-editor component and its test only after the new preview and page tests cover all of its needed file-input and removal behavior.

- [ ] **Step 4: Run focused frontend tests to verify the integrated flow**

Run:

```bash
npm test -- --run src/components/layout/__tests__/tech-profile-preview.test.tsx src/components/layout/__tests__/tech-profile-details-modal.test.tsx src/pages/__tests__/tech-profile-page.test.ts
```

Expected: PASS. Confirm no test imports the deleted `ProfileMediaEditor`.

- [ ] **Step 5: Commit the condensed page composition**

```bash
git add frontend/src/pages/tech-profile-page.tsx frontend/src/pages/__tests__/tech-profile-page.test.ts frontend/src/components/layout/profile-media-editor.tsx frontend/src/components/layout/__tests__/profile-media-editor.test.tsx
git commit -m "feat: condense tech profile editing flow"
```

### Task 4: Verify the full user-visible workflow

**Files:**
- Modify if verification exposes a defect: only the files from Tasks 1–3.

**Interfaces:**
- Consumes: completed UI and existing `/api/techs` and `/api/uploads/profile-media` contracts.
- Produces: evidence that one Save persists profile fields and staged media without regressions.

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run typecheck
npm run build
git diff --check
```

Expected: all commands exit `0`; `git diff --check` prints nothing.

- [ ] **Step 2: Run the full frontend test suite**

Run: `npm test`

Expected: PASS with no deleted-module or stale sidebar assertions.

- [ ] **Step 3: Perform a browser interaction check against local development**

Start the project with its documented local development command. As an authenticated tech with a profile, verify this exact sequence:

1. Click the avatar pencil, select a supported image, and see the new draft avatar.
2. Click the cover pencil, select a supported image, and see the new draft cover.
3. Click the gallery plus tile, select an image, and see it after the existing last image.
4. Hover/focus a gallery photo, activate its X, and see it disappear from the draft.
5. Click Edit profile, change business name and bio, then close and confirm the preview reflects the draft.
6. Reopen the modal, click Save profile, wait for one success toast, then reload and confirm text and media persisted.
7. At 12 images, verify the gallery add action is not available and the rest of the page still works.
8. At mobile viewport width, verify pencil, plus, remove, modal scrolling, Escape, and focus return are usable.

- [ ] **Step 4: Commit any verification-only fixes**

If and only if this step changes source files:

```bash
git add frontend/src/components/layout/tech-profile-preview.tsx frontend/src/components/layout/tech-profile-details-modal.tsx frontend/src/pages/tech-profile-page.tsx frontend/src/components/layout/__tests__/tech-profile-preview.test.tsx frontend/src/components/layout/__tests__/tech-profile-details-modal.test.tsx frontend/src/pages/__tests__/tech-profile-page.test.ts
git commit -m "fix: polish condensed profile editor interactions"
```
