# Discover Search and Filter Design

## Goal

Reshape the Discover page search controls to match the supplied compact search-bar and filter-modal references while preserving Find My Tech's editorial theme and existing marketplace behavior.

## Search rail

- Replace the three separate desktop controls with one responsive search rail and a separate circular filter trigger.
- Keep keyword and location as distinct inputs inside the rail so the location autocomplete contract remains intact.
- Place keyword search first and location second, separated by a subtle divider on desktop.
- Use the search icon as an explicit submit button. Submitting searches the selected or typed location through the existing backend flow.
- Preserve the existing keyword filtering, URL-derived initial values, location selection, location clearing, status messaging, and result behavior.
- On narrow screens, stack the keyword and location controls within one compact search card while keeping the filter trigger easy to reach.

## Filter modal

- Replace the permanently visible price-filter sidebar with a modal opened by the circular sliders button.
- Structure the modal like the supplied reference: heading and close control, a clearly labeled price-range group, selectable chips, and a footer with Clear and Apply filters actions.
- Price choices remain the existing four ranges and continue to support multiple selections.
- Changes are drafted locally in the modal. Apply commits them to the results; Clear removes the draft selections and applying the empty draft clears active price filters.
- Close button, backdrop click, and Escape dismiss the modal without applying draft changes.

## Visual direction

- Retain the existing editorial palette: paper and ivory surfaces, ink text, stone borders, and the established display/body typography.
- Borrow the references' soft pill silhouette and spacious modal composition without importing their cool gray palette.
- Use restrained rounding: a fully rounded search rail and circular filter trigger as the signature element, with a moderately rounded modal that still feels consistent with the editorial system.
- Active filter chips use an ink fill with paper text; inactive chips use paper with stone borders.
- The filter trigger displays an active-count badge when price filters are applied.

## Accessibility and responsive behavior

- Give the keyword input, location input, submit control, filter trigger, and close control explicit accessible labels.
- Expose modal semantics, keep focus visible, move focus into the modal when it opens, return focus to the trigger when it closes, and support Escape dismissal.
- Prevent background scrolling while the modal is open.
- Keep controls at comfortable touch-target sizes and preserve layout clarity down to mobile widths.

## Verification

- Add focused component/page tests for opening and closing the filter modal, applying multiple price ranges, clearing filters, and retaining the location search control.
- Run the focused Discover tests, frontend typecheck, frontend production build, and a diff whitespace check.
- Inspect the page in a browser at desktop and mobile widths, including modal open/close and search interactions.
