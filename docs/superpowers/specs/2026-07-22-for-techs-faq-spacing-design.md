# For Techs FAQ Spacing Design

## Goal

Give the `Common questions` section on `/for-techs` more breathing room without changing its content, interaction model, or the surrounding page design.

## Root cause

The For Techs FAQ cards reuse the global `.editorial-faq` class. That class belongs to the homepage FAQ section and applies a two-column grid, a large column gap, and section-level padding. Applying those rules to each For Techs card squeezes every question and answer into competing columns.

## Design

- Keep the existing centered heading and stacked bordered-card presentation.
- Replace the shared `.editorial-faq` card class with a For Techs-specific class so homepage section styles cannot leak into these cards.
- Use 48px between the section heading and the FAQ list.
- Use a consistent 24px gap between cards.
- Give cards 28px of internal padding on small screens and 32px from the medium breakpoint upward.
- Keep questions and answers stacked with 12px between them.
- Preserve the current Playfair display treatment, muted answer copy, square borders, colors, content, and responsive page width.

## Scope

Only the For Techs FAQ markup and its focused regression coverage are in scope. The homepage FAQ, global color tokens, other For Techs sections, and FAQ copy remain unchanged.

## Verification

- Add a focused source-level regression assertion that the For Techs cards use their own class and the intended spacing utilities.
- Run the focused For Techs page test and frontend typecheck.
- Inspect `/for-techs` in the browser at the current desktop viewport and a mobile-sized viewport, confirming readable stacked rows, deliberate spacing, and no horizontal overflow.
