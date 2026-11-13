# Cross-Page Editorial System Design

## Objective

Extend the approved Muse landing-page design across every application route and shared page surface without changing product behavior. The landing page remains the visual source of truth: porcelain ivory paper, carbon ink, warm-stone rules, high-contrast serif display type, compact sans-serif utility type, square controls, disciplined spacing, and photography or profile work as the primary visual material.

## Chosen Approach

Use a systemic editorial migration built from shared CSS primitives and semantic page classes, then adapt each route around its actual job. This is preferred over two rejected approaches:

- A global color-variable swap would leave rounded cards, colored pills, gradients, and app-template spacing intact.
- Independent page redesigns would create visual drift and duplicate style decisions.

The systemic approach preserves established React state and API boundaries while making shared elements—page intros, controls, cards, ledgers, tabs, dialogs, empty states, and profile surfaces—visually consistent.

## Global Visual Language

- Porcelain ivory `#F5F2EA` for primary page backgrounds.
- Paper white `#FCFBF7` for elevated work surfaces.
- Carbon black `#11110F` for type, primary actions, and the strongest callouts.
- Warm stone `#D8D2C8` for dividers and control borders.
- Muted taupe `#817A70` for secondary copy.
- Bodoni/Didot system stack for route titles, section titles, profile/business names, and key figures.
- Helvetica system stack for controls, navigation, filters, metadata, and form copy.
- Square or subtly softened geometry; circular geometry remains only where function requires it, such as avatar crops and icon-only save/edit controls.
- Hairline rules replace decorative shadows and pastel card backgrounds.
- Black primary buttons, ivory secondary buttons, and underlined text actions replace pink and violet button families.
- Status colors remain only for genuine success, warning, destructive, or saved-state feedback.

## Shared Primitives

Create reusable presentation components without moving page workflows:

- `EditorialPageIntro`: kicker, title, supporting copy, optional right-side action.
- `EditorialButton`: primary, secondary, text, and danger presentation while rendering a normal button.
- `EditorialPanel`: paper surface with optional ruled header.
- `EditorialEmptyState`: title, guidance, and optional action.

Page-local state, data fetching, and route navigation remain in the existing pages and facades.

## Route Designs

### Discover

- Ivory page background with a compact ruled search desk below the global header.
- Serif route title and concise featured/search context above results.
- Filters become a left-hand editorial index with ruled checkbox rows instead of a rounded card.
- Sort uses a compact square select.
- Artist cards use sharp image crops, serif names, compact metadata, and hairline borders without lift shadows or colored specialty pills.
- Loading, empty, error, and filtered states use editorial empty-state treatment.
- Search, location autocomplete, price filtering, sorting, saving, and profile navigation remain unchanged.

### Public Artist Profile

- Cover image remains the primary profile thesis, but the frame loses oversized rounding.
- Profile identity becomes a ruled information folio with a serif business name, compact specialty label, and black booking action.
- Pricing, service area, specialties, portfolio, contact methods, services, reviews, and review submission share one paper-and-rule language.
- Tabs become underlined editorial tabs rather than a rounded segmented control.
- Avatar remains circular or softly cropped because it represents identity.
- Save state may retain a restrained red heart as a genuine state signal.

### How It Works

- A centered serif intro on ivory paper.
- Customer and tech journeys become two editorial process ledgers with large sequence numbers, ruled rows, small icons, and no rounded cards.
- The genuine four-step order remains visible and meaningful.
- Customer and tech calls to action use the shared black/ivory button system.
- Privacy closes the page as a black contrast band or strongly ruled statement.

### For Techs

- Replace pink-gradient marketing composition with an ivory/black editorial business page.
- Retain signup, login, onboarding, location selection, profile creation, referral entry, comparison, FAQ, and CTA behavior.
- Remove unsupported `400+` tech and `2,400+` client claims.
- Replace the fabricated statistics grid with factual launch terms: free during launch, zero platform booking commission currently charged, portfolio-first profiles, and service-area privacy.
- Benefits and comparison content use ruled ledgers instead of rounded feature cards.
- Referral code output remains monospaced but sits in a square paper ticket.

### Tech Profile Editor

- Owner profile preview matches the public profile editorial treatment so editing remains preview-first.
- Editor header, create/retry/loading states, tabs, gallery controls, media controls, referral display, and detail modal adopt shared tokens.
- Inline edit affordances remain obvious and keyboard accessible.
- Existing draft/save/retry/delete/upload workflows and owner/customer action differences remain unchanged.

## Dialogs and Overlays

- Account authentication, account settings, saved techs, tech signup, and profile details use square paper dialogs with carbon title bars or ruled ivory headers.
- Tabs and role selectors use underlined or bordered editorial controls.
- Inputs use square borders, white/paper backgrounds, compact labels, and visible focus outlines.
- Close buttons remain icon-only and circular where that improves target clarity.
- Dialog roles, labels, escape/backdrop behavior, focus management, validation, and submission behavior remain unchanged.

## States and Accessibility

- Loading, empty, not-found, and retry states always explain what is happening and what action is available.
- Success/error color is semantic rather than decorative.
- Existing ARIA roles and names remain intact.
- New shared controls use `type="button"` unless they submit a form.
- Visible `:focus-visible` outlines work on ivory, paper, and black surfaces.
- Mobile layouts preserve usable touch targets and reading order.
- Reduced-motion support from the landing system applies to all editorial surfaces.

## Architecture and Data Flow

- No backend, schema, API, route, facade, or query-contract changes.
- Existing pages continue to own state and orchestration.
- Shared presentation primitives live in `frontend/src/components/ui/editorial-ui.tsx`.
- Cross-page styling lives in `frontend/src/assets/globals.css` under `editorial-*` classes.
- Page-specific components remain in their current feature folders.
- The public profile and owner preview may share class names but do not merge behavior-heavy components.

## Testing and Verification

- Add source/render assertions that every route exposes its editorial root and serif route heading.
- Preserve all existing interaction and workflow tests.
- Add focused coverage for shared editorial primitives and factual For Techs content.
- Run all frontend tests, TypeScript, and the production build after each page group.
- Inspect `/discover`, `/how-it-works`, `/for-techs`, a public artist profile, and `/tech-profile` at desktop and phone widths in a real browser.
- Exercise search, filters, sorting, save controls, tabs, review form, signup/login, modals, editor actions, and primary route CTAs where local data permits.
- Confirm no horizontal overflow and no browser console errors introduced by the redesign.

## Non-Goals

- Changing marketplace functionality or adding new product features.
- Modifying backend data, authentication contracts, or database schema.
- Inventing profiles, testimonials, customer counts, revenue claims, or growth statistics.
- Forcing interior pages into the exact landing-page section order when their workflow needs a different information hierarchy.
