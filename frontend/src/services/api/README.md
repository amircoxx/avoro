# Browser API modules

## Purpose

This directory is the frontend boundary for HTTP requests. Pages and components import from `@/services/api`; they do not call `fetch` directly.

## Modules

- `client.ts` owns API URL construction and shared response/error parsing.
- `types.ts` owns request and response types shared by browser code.
- `auth.ts`, `techs.ts`, `profiles.ts`, `media.ts`, and `locations.ts` own endpoint calls by domain.
- `../api.ts` re-exports this directory's public contract so existing imports remain stable.

## Adding a request

Add a typed function to the module that owns the endpoint, use `apiUrl` and `readApiResponse`, then export it through `../api.ts`. Keep rendering state in the page or component that calls the function. Use a facade when a page-level workflow combines multiple API operations; pages and components may call one focused API function for isolated interactions such as autocomplete.

## Trace a request from the screen

Start at `frontend/src/routes/app-routes.tsx`, then read the route page, its feature-local sections, and any workflow facade before changing this boundary. Discover search follows `pages/discover-page.tsx` -> `facades/discover.facade.ts` -> `api/techs.ts`; its `GET /api/techs/search?...` request continues through the backend tech route and controller to `backend/src/services/tech-search.service.ts`.

Owner profile save follows `pages/tech-profile-page.tsx` -> `api/profiles.ts`; its `POST /api/techs` request continues through the backend tech route and controller to `backend/src/services/tech-profile.service.ts`.

Keep shared shell and dialog UI in `components/layout`, reusable product controls in `components/common`, and one-page-only sections beside the page that composes them. `../api.ts` is the documented compatibility import for browser callers; preserve it and add new public API exports there after placing the implementation in its domain module.
