# Tech profile navigation

## Goal

Make the primary navigation clear for authenticated techs. A tech with an account should not be sent to a marketing page that asks them to create an account or profile.

## Navigation behavior

- Visitors and customer accounts keep the `For Techs` navigation link, which opens `/for-techs`.
- Authenticated tech accounts see `My Profile` in that same navbar position. It opens `/tech-profile`.
- The mobile navigation follows the same rule.
- Remove the redundant `Edit my profile` actions from the authenticated-tech dropdown and mobile account actions. The account menu remains for secondary actions such as settings and sign out.

## Profile route behavior

`/tech-profile` remains the single profile route.

- When the authenticated tech already has a profile, render the existing editor in edit mode.
- When the authenticated tech has no profile, render a dedicated empty state that explains that a profile is needed to be discovered and provides a `Create profile` button.
- Activating that button renders the existing profile editor in create mode. The heading, supporting copy, and primary action use create-oriented language. The form starts blank and uses the existing save path to create the profile.

## Boundaries

- The existing tech-profile facade remains responsible for loading and saving the profile.
- The page owns which visual state to render, local form state, loading indicators, and toast feedback.
- No new route, backend endpoint, or API contract is needed.

## Error handling and validation

- Existing role protection remains: unauthenticated and non-tech users are redirected away from `/tech-profile`.
- A failed profile load continues to show the existing error toast.
- Existing form and location validation apply in both create and edit mode.

## Verification

- Add or update focused tests for the tech-specific navbar label and the no-profile empty state/create transition.
- Run the relevant frontend tests and typecheck/build checks after implementation.
