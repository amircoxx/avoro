# How It Works Flowing Path Design

## Objective

Redesign `/how-it-works` around the supplied flowing-process reference while keeping the result recognizably Muse. The page should explain the marketplace quickly, feel more visual than the current stacked-card layout, preserve the existing customer and tech destinations, and work cleanly from desktop to phone widths.

## Chosen Direction

Use one customer-led, hand-drawn process path as the page's signature element. A compact tech invitation follows the main journey instead of repeating a second full diagram. This keeps the reference's sense of movement without making the page visually crowded or duplicating eight similarly weighted steps.

Two alternatives were rejected:

- A literal copy of the reference would introduce a generic corporate visual language that conflicts with Muse's existing editorial identity.
- Separate full customer and tech paths would compete for attention and make the page longer and harder to scan.

## Visual System

- Porcelain ivory `#F5F2EA` remains the page background.
- Paper white `#FCFBF7` is used sparingly for content surfaces.
- Carbon `#11110F` carries headings, body emphasis, and primary controls.
- Warm stone `#D8D2C8` is used for rules and quiet boundaries.
- Muted taupe `#817A70` is used for supporting copy.
- Editorial black `var(--editorial-ink)` is the sole accent for the route line, milestones, and small labels.
- Existing Bodoni/Didot display and Helvetica utility stacks remain in place so the page belongs to the rest of Muse.

## Page Composition

### Intro and Customer Journey

The main section uses an asymmetric desktop composition inspired by the reference. The left side introduces the page with the kicker `The Muse process`, a direct headline, supporting copy, and a `Find an artist` action. A black route sweeps across the section and connects three numbered customer milestones:

1. Search nearby by location and service.
2. Compare real portfolios, service details, and reviews.
3. Connect directly with the artist who fits.

Large translucent sequence numbers sit behind concise milestone copy. Each stop has a high-contrast node on the route. The path is decorative and hidden from assistive technology; the semantic ordered list remains the actual content structure.

### Tech Invitation

A compact ruled strip below the journey addresses nail and lash techs. It explains the parallel value in three short points: create a profile, appear in local discovery, and build trust through real work and reviews. `Create your free profile` opens the existing account overlay directly in registration mode without changing routes. The overlay remains shared with the header's `Create account` action so there is only one registration experience.

### Privacy Close

The page closes with a paper-white `#FCFBF7` statement explaining Muse's service-area privacy and direct-contact model. Carbon type preserves strong readability, while a thin black top rule and black-outlined shield connect the statement to the route graphic without introducing another colored block. The layout and copy remain unchanged.

## Responsive Behavior

At desktop widths, the route travels horizontally through an intentionally staggered layout. On tablets and phones, the journey becomes a vertical sequence with a simple black spine so copy remains readable and the visual order is unambiguous. No essential meaning depends on the SVG path. Buttons retain usable touch targets, headings avoid clipping, and the page must not introduce horizontal overflow.

## Motion and Accessibility

- The route may draw in once on page entry and milestones may reveal in sequence.
- Under `prefers-reduced-motion: reduce`, all content appears immediately and the path remains static.
- The process uses an ordered list with visible step numbers.
- Decorative SVG and oversized background numbers are ignored by assistive technology.
- Existing visible focus treatment and button semantics are preserved.

## Architecture and Scope

- Replace the presentation in `frontend/src/pages/how-it-works-page.tsx`.
- Add route-scoped styles to `frontend/src/assets/globals.css`, preserving unrelated in-progress edits in that file.
- Keep customer discovery navigation through the existing router hook.
- Expose the existing account overlay through a small app-shell context so route content can request `register` mode without duplicating modal state or markup.
- Do not change backend services, API contracts, authentication, shared routing, or other pages.
- Do not introduce stock photos, fabricated statistics, testimonials, or new dependencies.

## Verification

- Add focused tests for the three customer milestones, tech invitation, customer CTA destination, registration-overlay CTA, and semantic ordered-list structure.
- Run the relevant page tests, the full frontend test suite, TypeScript checking, and the production build.
- Inspect `/how-it-works` in a real browser at approximately `1440x1000` and `390x844`.
- Exercise both primary calls to action, confirm the tech CTA opens the register overlay without navigation, and check keyboard focus, responsive order, horizontal overflow, reduced-motion behavior, and the browser console.
