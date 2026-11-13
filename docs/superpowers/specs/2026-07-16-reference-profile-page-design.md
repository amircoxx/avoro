# Reference-Inspired Profile Page Design

## Objective

Recompose the public artist profile around the supplied reference image while retaining Muse's established editorial theme and every existing marketplace contract.

## Chosen direction

Use the reference's information architecture rather than copying its unrelated mentoring product concepts. The page keeps Muse's porcelain, paper, carbon, stone, serif-display, and compact utility language while adopting a wide identity header, a strong circular portrait, a ruled tab row, a two-column overview, insight cards, experience details, and a sticky booking panel.

The supplied teal cover becomes the artist's actual cover image with a warm-stone fallback. Upvotes, mentoring minutes, achievements, group sessions, and fabricated availability are excluded because Muse has no supporting data or workflow for them.

## Composition

- A back link leads into a restrained cover band.
- A large circular portrait overlaps the cover and paper identity header.
- The identity block presents the artist name, discipline, handle, rating, review count, and public service area.
- Primary booking/message and saved-profile controls remain in the header.
- Tabs become Overview, Services & Pricing, and Reviews.
- Overview uses a two-column desktop layout. The left dossier contains biography, direct contact methods, profile insights derived from real data, experience/specialties, and portfolio. The right column contains a sticky appointment card with starting price, location, booking guidance, and the same real booking action.
- Mobile uses a single reading column with the appointment card following the overview content.

## Data and behavior

No API, facade, authentication, review, saved-tech, routing, or booking contract changes. Empty services, portfolio, and contact states remain honest. Review submission and customer-only save authorization stay unchanged.

## Accessibility and responsive behavior

- The active tab remains exposed through `role="tab"` and `aria-selected`.
- Save state retains a pressed/state label and disabled feedback.
- Contact links keep explicit accessible names.
- Focus treatment uses the existing editorial focus ring.
- The portrait and cover preserve useful alternative text.
- The sidebar loses sticky positioning on narrow screens and no horizontal overflow is introduced.

## Verification

Add focused render and interaction assertions for the reference-inspired hierarchy, overview default, tab switching, save action, real-data insights, and honest empty content. Run the profile tests, the entire frontend test suite, typecheck, production build, then inspect desktop and mobile routes in a real browser.
