# Navbar order

## Goal

Place the explanatory `How It Works` link before the role-aware tech destination in the primary navigation.

## Behavior

- Desktop order: `Discover`, `How It Works`, then `My Profile` for authenticated techs or `For Techs` for everyone else.
- Mobile order: `Discover Artists`, `How It Works`, then the same role-aware tech destination.
- Labels, routes, active-link behavior, and account controls remain unchanged.

## Scope

- Modify only the shared navigation component and its focused navigation test.
- No backend, API, routing, or authentication changes.
