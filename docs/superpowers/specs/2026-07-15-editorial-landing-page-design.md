# Editorial Landing Page Design

## Objective

Remake the Muse landing experience to closely follow the supplied NOELA editorial reference while preserving Muse's real purpose: helping customers discover local nail and lash techs and helping techs create profiles. The page should feel like a restrained beauty editorial rather than a rounded, pink marketplace template.

The primary conversion is customer discovery. Tech profile creation remains the secondary conversion.

## Scope

- Restyle the shared site header and footer in the black-and-ivory editorial system.
- Replace the current homepage composition with a reference-faithful hero, discovery strip, service ledger, factual statistics panel, editorial gallery, privacy section, and tech callout.
- Preserve existing authentication, role-aware navigation, saved-tech, account-settings, location-autocomplete, and discovery-routing behavior.
- Add original local nail-and-lash editorial imagery so the page has no runtime dependency on third-party image URLs.
- Keep changes focused on the landing experience and shared shell. Other application pages retain their current content and behavior.

## Visual System

### Palette

- Porcelain ivory: `#F5F2EA`
- Paper white: `#FCFBF7`
- Carbon black: `#11110F`
- Warm stone: `#D8D2C8`
- Muted taupe: `#817A70`

Color is restrained. Black supplies emphasis; ivory and paper white establish the page; warm neutrals handle rules, muted text, and quiet panels. The redesign removes the landing page's pink gradients, pastel badges, and pill-shaped surfaces.

### Typography

- Display and wordmark: a high-contrast fashion serif with elegant thin/thick contrast.
- Navigation, controls, labels, and statistics captions: a compact sans-serif.
- Headline sizes are fluid and use deliberate line breaks. Utility copy stays small and crisp.

### Shape and Rules

- Mostly square corners.
- Thin warm-stone rules organize sections.
- Buttons use compact rectangular proportions.
- Focus indicators remain clearly visible against ivory and black.

## Page Composition

### Header

A slim ivory header follows the reference composition:

- Left: Home, Discover, How It Works.
- Center: MUSE serif wordmark.
- Right: role-aware For Techs or My Profile plus existing login/account actions.
- Mobile: centered wordmark, compact menu control, and a single-column menu that retains every action.

All existing authentication modals, saved-tech controls, account settings, logout behavior, and route-aware labels remain functional.

### Hero

The hero is a large, edge-to-edge close-up nail editorial photograph with a subtle dark overlay. Centered copy reads:

> Your next beauty artist is closer than you think.

A compact ivory `Find a tech` button scrolls or moves focus to the discovery form immediately beneath the image. The image remains legible across desktop and mobile crops and has meaningful alternative text.

### Discovery Strip

The strip occupies the same visual rhythm as the reference's publication-logo row, but it performs a real marketplace job. It contains:

- Service query input.
- Existing location autocomplete.
- `Search artists` action.
- A short supporting label that identifies nail and lash discovery.

The surface resembles an appointment card cut from a magazine: sharp edges, hairline dividers, ivory background, and compact typography. Submission preserves the current `/discover` query-parameter contract, including structured location values when a suggestion is selected and free-form location fallback otherwise.

### Service Ledger and Product Facts

The next section mirrors the reference's left accordion and right statistics block.

The service ledger contains accessible disclosure rows for:

- Nail services.
- Lash services.
- Search by location.
- Verified reviews and portfolios.

Each row exposes short, factual copy and a discovery action where appropriate. Rows use native buttons with `aria-expanded` and keyboard-operable behavior.

The product-facts block uses truthful facts instead of invented traction:

- `02` specialties: nails and lashes.
- `03` steps: search, compare, connect.
- `00` exact home addresses publicly required.

### The Beauty Edit

A three-image editorial grid mirrors the reference's lifestyle gallery:

- Close-up nail artistry.
- Close-up lash artistry.
- A beauty tech working with tools or preparing a client.

Images use coordinated neutral lighting, intentional crops, local files, useful alternative text, and responsive sizing. On small screens the grid becomes a horizontally composed or stacked editorial sequence without tiny, unreadable crops.

### Privacy

A ruled editorial section explains three concrete product principles:

- Artists share service areas rather than exact home addresses.
- Profiles lead with real portfolio work.
- Reviews help customers compare local talent.

This section stays typographically quiet and does not introduce a different card-based visual language.

### Tech Callout

A single carbon-black panel provides the page's strongest contrast. The headline reads:

> Your work deserves to be discovered.

It routes techs to `/for-techs`, explains free launch access and referral benefits without inventing outcomes, and uses one ivory primary action plus a restrained secondary text link.

### Footer

The shared footer adopts ivory paper, fine rules, the serif MUSE wordmark, and compact editorial link columns. Existing customer, tech, company, policy, toast, and route actions remain available. The copyright year is current.

## Responsive Behavior

- Desktop keeps the reference's centered page width, two-column ledger/statistics section, and three-image gallery.
- Tablet preserves editorial hierarchy while reducing hero and headline scale.
- Mobile becomes one column in this order: hero, discovery strip, service ledger, product facts, gallery, privacy, tech callout, footer.
- Navigation remains reachable by keyboard and touch.
- Motion is limited to purposeful disclosure, hover, and entrance transitions and is disabled when `prefers-reduced-motion` requests it.

## Component Boundaries

- `home-page.tsx` owns discovery state and composes the landing sections.
- Page-specific visual sections live in a `pages/home/` feature folder.
- Shared header and footer remain in `components/layout/`.
- Existing `LocationAutocomplete`, router hooks, facades, and authentication components remain the behavior boundaries.
- No new backend endpoint or database change is required.

## Error and Empty Behavior

- A free-form location remains valid input and routes through the existing fallback parameter.
- Empty service and location inputs route to unfiltered discovery.
- Autocomplete loading, empty, and failure behavior remains owned by the existing component.
- Missing imagery is avoided by bundling local assets; layout dimensions prevent disruptive content shift.

## Accessibility

- Semantic landmarks and heading order.
- Descriptive image alternatives, with decorative images hidden where appropriate.
- Visible focus styles on ivory and black backgrounds.
- Keyboard-operable navigation, search, disclosures, and calls to action.
- `aria-expanded` and controlled content relationships for disclosure rows.
- Sufficient color contrast and reduced-motion support.

## Verification

- Update homepage tests for the new factual content and retained discovery routing.
- Add interaction coverage for service disclosures and query/location navigation.
- Run frontend tests, type checking, and production build.
- Start the local app and inspect the homepage in a real browser at desktop and phone widths.
- Compare screenshots against the supplied reference for composition, spacing, typography, cropping, and responsive hierarchy.
- Exercise header navigation, mobile menu, hero CTA, search submission, disclosures, tech CTA, login/account affordances, and footer actions.

## Non-Goals

- Redesigning every interior application page.
- Adding fabricated profiles, reviews, testimonials, customer counts, or marketplace traction.
- Changing API contracts, authentication, database schema, or discovery behavior.
- Reproducing the reference's device frame or screenshot-viewer overlays.
