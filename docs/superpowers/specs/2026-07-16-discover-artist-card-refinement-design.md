# Discover Artist Card Refinement

## Goal

Bring the Discover artist cards closer to the supplied portrait-card reference while preserving Muse's established black-and-ivory editorial system and all existing marketplace behavior.

## Visual direction

- Lead with a tall `4:5` artist portrait instead of the current shallow landscape crop.
- Keep square edges, hairline rules, ivory/white surfaces, black type, and the existing display serif.
- Use the artist type and featured state as factual image labels. Do not add a verification badge because the artist contract has no verified state.
- Place the artist name, price, specialty, rating, review count, and location in a calm information block below the portrait.
- Finish with a ruled footer rail containing the first two specialty tags and a clear `View profile` affordance.
- Retain the save control in the upper-right corner of the portrait.

## Interaction and accessibility

- Clicking the card continues to open the artist profile.
- Clicking Save or Unsave continues to update saved state without opening the profile.
- The card remains usable when no profile image, tags, distance, rating, or reviews are available.
- Existing visible labels and accessible save labels remain intact.

## Responsive behavior

- Desktop keeps the current three-column Discover grid with taller cards.
- Tablet and mobile continue using the existing two- and one-column breakpoints.
- Card content may grow naturally instead of clipping long locations or prices.

## Verification

- Extend the existing `ArtistCard` test with the new portrait, information, and footer classes.
- Run the focused ArtistCard and Discover tests, followed by the full suite, type-check, and build.
- Inspect the live Discover grid at desktop and mobile widths and confirm saving and navigation remain available.
