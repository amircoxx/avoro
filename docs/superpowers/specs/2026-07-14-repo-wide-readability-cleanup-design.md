# Repo-Wide Readability Cleanup Design

## Goal

Make Find My Tech approachable for a first-time contributor without changing its product behavior, public HTTP contracts, database schema, routes, or visual UX.

## Scope

The cleanup covers both applications:

- `frontend/`: React route screens, layout components, reusable UI, facades, browser API modules, hooks, and utilities.
- `backend/`: Express routes, controllers, services, models, validations, middleware, and configuration.
- `docs/architecture.md`: onboarding-oriented architecture and request-flow documentation.

It includes removing code only when repository-wide reference checks and tests establish that the code is unused.

## Architecture

The existing ownership model remains the source of truth. The cleanup improves adherence to it rather than introducing a new framework or folder hierarchy:

```text
Frontend page
  -> feature-local view helpers and sections
  -> facade (for multi-request workflows)
  -> API domain module
  -> Express route -> controller -> service -> Prisma model
```

Route pages will continue to own route state and composition. Large pages and layout files will be decomposed into colocated, single-purpose feature modules where those units make the flow easier to follow. API calls remain in the `frontend/src/services/api` domain modules. Backend routes retain endpoint mapping, controllers retain HTTP orchestration, services retain domain rules, and models retain Prisma access.

## Cleanup Strategy

### 1. Establish a clear codebase map

Update the architecture document with a first-contributor reading path, directory responsibilities, representative request flows, and guidance for deciding where new code belongs. Add small module-level READMEs only where a complicated domain has no discoverable entry point from the code and architecture document.

### 2. Decompose oversized frontend modules

Prioritize the largest and most responsibility-mixed files, including the application shell and route screens. Extract only cohesive units such as navigation sections, modal content, display-only profile sections, and page-local view-model helpers. Keep files colocated with the feature they serve; do not create a generic dumping-ground directory.

Each extracted module must have a descriptive name, explicit props/input types, a single responsibility, and no new direct network calls outside the API layer.

### 3. Clarify backend domain boundaries

Keep the current route-controller-service-model sequence. Move mixed-purpose helpers from service modules into focused domain helpers only when the resulting caller and dependency direction are simpler. Normalize names so that a route, controller operation, service operation, schema, and API client can be traced by domain and action.

### 4. Remove dead code safely

Identify candidates through imports, exports, string references, and test references. Delete a candidate only after no supported entry point imports or invokes it, then run the relevant tests and typecheck. Do not remove compatibility entry points unless all current consumers are migrated in the same change.

### 5. Preserve contracts and prove behavior

Preserve URLs, API status/response formats, cookie/session behavior, Prisma schema, and visual behavior. Pair each nontrivial extraction with focused regression coverage or an existing focused test run. Finish with workspace typecheck, tests, build, `git diff --check`, and a final unused-reference audit.

## Non-Goals

- No redesign of the user interface or copy.
- No new framework, state-management library, database migration, or API version.
- No speculative abstraction or large-scale file moves merely to make the tree look different.
- No deletion based only on a file appearing old or redundant.

## Success Criteria

- A new contributor can identify the owner of a UI, API, validation, or database concern from the directory structure and architecture guide.
- The largest mixed-responsibility modules are split into focused, discoverable units.
- Dead code found during the audit is removed only with evidence and regression verification.
- All workspace tests, typechecks, and builds pass with no contract changes.
