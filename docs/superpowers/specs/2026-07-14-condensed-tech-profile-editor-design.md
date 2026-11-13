# Condensed tech profile editor

## Goal

Replace the current two-column `/tech-profile` editor with a compact, profile-first editing surface. Techs should edit profile and background photos directly on their displayed profile, manage gallery images in place, and open a modal only when changing profile details.

## Scope

This design applies to the authenticated-tech `/tech-profile` route in the existing Vite/React frontend. It preserves the current draft-first save workflow, media roles, upload constraints, deletion contract, and owner-only route protection.

## Page layout

- Remove the right-hand editor panel and its always-visible form fields and media manager.
- Render the existing profile-view composition as the primary and only desktop page content.
- Keep the existing back navigation, loading, error, and no-profile/create-profile states.
- Replace the public-preview label with a `My profile` owner context and provide an `Edit profile` button within the displayed profile card.
- Do not show the business name, display name, bio, profile email, phone, booking URL, Instagram URL, specialties, city, featured service, starting price, service description, or publish toggle as editable controls on the page.

## In-place media controls

### Profile picture

- Overlay a compact pencil icon button in the lower-right corner of the displayed profile picture.
- The button opens the existing JPEG/PNG/WebP file picker for the `profile` media role.
- Selecting a valid image immediately updates the on-page draft preview. It is uploaded only when the user saves the profile.
- Preserve existing type and 10 MiB validation and replace behavior for profile images.

### Background image

- Overlay a compact pencil icon button in the lower-right corner of the displayed background image.
- The button opens the existing file picker for the `background` media role.
- Selecting a valid image immediately updates the draft cover. It is uploaded only when the user saves the profile.
- Preserve existing type and 10 MiB validation and replace behavior for background images.

### Gallery

- Render gallery images in their existing `sortOrder` order.
- Add a square `+` upload tile immediately after the last gallery image; if there are no images, it is the first gallery tile.
- The tile opens the existing file picker for the `gallery` media role and participates in the existing 12-image maximum.
- Hide or disable the tile at the 12-image limit and expose an accessible explanation that the gallery is full.
- On hover and keyboard focus, show an `X` button in the upper-right corner of every gallery image.
- Activating `X` removes the image from the draft immediately. Persisted images are queued for deletion; pending uploads are removed locally and their object URL is revoked. Neither kind is permanently deleted until Save.
- Use non-text icon buttons with explicit accessible labels, including the image position for gallery removal.

## Details modal and saving

- `Edit profile` opens a modal dialog with the existing non-media inputs: business name, display name, bio, profile email, phone, booking URL, Instagram URL, specialties, city, featured service, starting price, service description, and publish toggle.
- The modal uses local page state, not a second profile model. Changes update the profile view underneath as the user types.
- The modal has Cancel/close and a single `Save profile` action. Save persists both the modal fields and all queued media additions/replacements/removals through the existing `saveTechProfileWorkflow`, `uploadProfileMedia`, and `removeProfileMedia` sequence.
- Closing or cancelling the modal does not discard draft changes by itself. Leaving the route with unsaved changes continues to use the existing navigation/unload protection.
- Save failures retain the staged state for retry and preserve the existing role-specific media error feedback. A successful save resets the draft baseline and refreshes the profile as today.

## Accessibility and responsive behavior

- All pencil, plus, and remove buttons must be keyboard reachable, have descriptive `aria-label` values, show visible focus styling, and meet the existing disabled-state behavior while saving.
- The gallery remove control is visible on hover and focus; on touch layouts it remains discoverable without relying on hover alone.
- The modal declares dialog semantics, traps focus while open, closes with Escape, returns focus to `Edit profile`, and scrolls internally on small screens.
- The profile surface, controls, and gallery work at mobile widths without a desktop-only side panel or hover-only required action.

## Boundaries

- No backend schema, API route, upload contract, or media validation changes are required.
- `profile`, `background`, and `gallery` remain separate media roles.
- Gallery maximum remains 12 images. Existing `gallery_full` server behavior remains authoritative for concurrent sessions.
- Existing direct upload, public profile display, draft helper, and unsaved-navigation behavior remain the source of truth.

## Verification

- Add focused tests for page-level modal visibility, in-place upload triggers, gallery plus placement, and staged removal behavior.
- Update media-editor/preview tests or replace the old sidebar-specific assertions with owner-surface interaction assertions.
- Run focused frontend tests, typecheck, and production build.
- Verify the complete interaction manually in a browser: upload avatar, upload cover, add gallery image, remove a gallery image, edit details in the modal, save once, reload, and confirm persisted public/profile rendering.
