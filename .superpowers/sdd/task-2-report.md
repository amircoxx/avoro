# Task 2: No-profile create gate

## Status

Implemented and verified.

## What changed

- Added `hasProfile` and `isCreatingProfile` state to `TechProfilePage`.
- Recorded profile presence when `loadTechProfile()` resolves, before the existing profile-mapping guard.
- Added the no-profile CTA screen for signed-in TECH users and reveal of the existing editor after `Create profile` is selected.
- Switched the editor heading, supporting copy, and submit label to create-mode copy.
- Marks the profile as present and exits create mode after a successful save, before the success toast.
- Added the prescribed source-contract test for the gate and create-mode copy.

## TDD evidence

### RED

Command:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
```

Result: failed exactly because `TechProfilePage` did not yet contain `hasProfile` state. The new contract test failed while the three pre-existing tests passed.

### GREEN

Command:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
```

Result: passed, 1 test file and 4 tests.

## Full verification

Command:

```sh
npm --prefix frontend test
```

Result: passed, 20 test files and 51 tests.

`git diff --check` also completed with no whitespace errors.

## Files changed

- `frontend/src/pages/tech-profile-page.tsx`
- `frontend/src/pages/__tests__/tech-profile-page.test.ts`

## Self-review

- The pre-existing TECH role guard and redirect remain before the new gate.
- The existing facade (`loadTechProfile`, `saveTechProfileWorkflow`) and all media upload/removal flow remain unchanged.
- The CTA only appears after profile loading is complete and the resolved profile is absent.
- A successful creation switches the page into normal edit state before the success toast.
- The implementation uses every required state, condition, and literal from the task brief.

## Concerns

None. The requested tests pass; this task specified source-contract coverage rather than a browser interaction test.

---

# Task 2 review-finding fixes

## Status

Implemented and verified.

## Fixes

- Added an unresolved-profile loading gate after the existing auth/TECH guard. The editor now cannot render while profile presence is unresolved, so a TECH user with no profile sees the no-profile CTA only after `loadTechProfile()` settles.
- Moved the profile-presence update behind the existing `isMounted` check. A completed request after unmount now exits before calling `setHasProfile` or mapping profile state.
- Added a DOM-level regression test that keeps the profile request pending, verifies the editor is absent, resolves to `null` and observes the CTA, then clicks `Create profile` and verifies the create-mode editor is shown.

## TDD evidence

### RED

Command:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
```

Result: failed with the regression assertion because the initial pending state rendered `Edit your profile` alongside the loading text.

### GREEN

Command:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
```

Result: passed, 1 test file and 5 tests.

## Verification

Commands:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
npm --prefix frontend test
git diff --check
```

Results:

- Focused test: passed, 1 file and 5 tests.
- Full frontend suite: passed, 20 files and 52 tests.
- `git diff --check`: passed with no whitespace errors.

## Self-review

- The existing auth redirect and TECH-only guard remain before profile loading and all new rendering gates.
- The API facade boundary, route, navigation, and backend contracts are unchanged.
- `setHasProfile(Boolean(profile))` occurs only when the profile-load effect is mounted; `null` continues to resolve as no profile and reaches the CTA.
- The regression test is behavior-level DOM coverage, rather than only source-text coverage.

## Concerns

None.

---

# Task 2 re-review lifecycle fixes

## Status

Implemented and verified.

## Fixes

- Replaced independent async-effect mount flags with one component-level mounted ref. The profile-load and save workflows now check it before every React state update that follows async work, including the post-save refresh and `setHasProfile(true)`.
- Added explicit profile-load error state with the existing error toast. A failed initial request now renders its error with a Retry button; Retry starts a fresh `loadTechProfile()` attempt. Only a successful `null` result reaches the create-profile CTA.
- Added DOM-level behavioral coverage for rejection -> Retry -> resolved `null` -> CTA, plus a valid in-flight save that unmounts before resolution and therefore does not start the post-save refresh.

## TDD evidence

### RED

Command:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
```

Result: the new load-error/retry test failed because the page remained on `Loading profile...` after the rejected request.

### GREEN

Command:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
```

Result: passed, 1 test file and 7 tests.

## Verification

Commands:

```sh
npm --prefix frontend test -- tech-profile-page.test.ts
npm --prefix frontend test
npm --prefix frontend run typecheck
git diff --check
```

Results:

- Focused page suite: passed, 1 file and 7 tests.
- Full frontend suite: passed, 20 files and 54 tests.
- Typecheck: passed.
- `git diff --check`: passed with no whitespace errors.

## Self-review

- The auth/TECH guard, routes, navigation, backend/API contracts, and `tech-profile` facade boundary are unchanged.
- The create CTA remains exclusive to a successful `loadTechProfile()` resolution of `null`; rejected loads remain retryable errors.
- Every save-path state update after an await is guarded by the shared mounted ref, including the success transition that sets profile presence.
- The new tests exercise rendered behavior and real deferred promises; they do not depend solely on source-text assertions.

## Concerns

None.
