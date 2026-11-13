# For Techs Theme Cleanup Design

## Goal

Bring the `/for-techs` marketing page into the existing editorial black-and-cream theme, remove the standalone referral promotion shown in the supplied screenshot, and keep the “Create your free profile” actions legible on hover.

## Scope

- Remove only the standalone “Know a fellow tech?” referral panel.
- Preserve the referral feature card, referral FAQ, and referral-code onboarding behavior.
- Replace decorative rose, violet, emerald, amber, cyan, and pink accents on the marketing page with the existing editorial theme tokens: ink, paper, ivory, stone, and taupe.
- Preserve semantic success and error colors inside the signup workflow because those colors communicate form state.
- Keep both marketing-page “Create your free profile” buttons readable in their default, hover, focus-visible, and disabled states.
- Preserve the page structure, copy, routing, signup modal behavior, and responsive layout.

## Visual Direction

The page will use the same restrained editorial language as the rest of the application: ivory and paper surfaces, ink typography and controls, stone borders, and taupe secondary text. Feature icons become monochrome editorial marks rather than a rainbow set. The primary signup action remains visually dominant through contrast, not an unrelated accent color.

The final dark call-to-action section keeps its ink background. Its button uses paper with ink text by default and a stone-toned hover surface with ink text, preventing the current black-on-black or low-contrast state.

## Implementation Approach

Use focused semantic classes scoped beneath `.editorial-for-techs`. Avoid a global token change, which would affect unrelated routes, and avoid blanket CSS specificity overrides, which caused the existing hover conflict. Remove obsolete page-only markup and the now-unused `Users` import only where safe.

## Testing

1. Add a failing page regression test asserting the standalone referral panel is absent while referral functionality elsewhere remains intact.
2. Add a failing stylesheet/source regression test asserting the For Techs marketing palette uses editorial tokens and the final CTA hover keeps contrasting foreground and background colors.
3. Make the smallest page and stylesheet changes needed to pass.
4. Run the focused tests, the full frontend test suite, typecheck, build, and `git diff --check`.
5. Verify the page and CTA hover visually at desktop and mobile widths in a real browser.

## Non-Goals

- Removing the referral program from the product.
- Redesigning the signup modal or changing its form-state colors.
- Reworking page copy, information architecture, navigation, or backend behavior.
- Refactoring unrelated editorial styles.
