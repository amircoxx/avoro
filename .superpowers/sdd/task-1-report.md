# Task 1 Report: Map public profiles without fixture data

Status: DONE

## Changes

- Removed `frontend/src/assets/artists.ts`, including all static marketplace fixture data.
- Moved the `Artist`, `ArtistType`, `Service`, and `Review` presentation types to `frontend/src/services/api/profiles.ts`.
- Updated every prior type-only consumer to import those types through `@/services/api`.
- Updated the mapper to use API values or neutral defaults only. Incomplete profiles now yield empty image, cover, gallery, reviews, distance, tags, bio, specialty, and zero price/rating defaults; an absent price remains `Contact for pricing`.
- Replaced the artist-card test fixture with a local API-shaped display model.

## Test-first evidence

1. Added `public tech profile mapping > uses neutral display values when the API profile has no optional marketplace data` to `frontend/src/services/__tests__/profiles.test.ts` before production changes.
2. Ran `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts`.
   - Result: expected failure. The mapper returned fixture photo, cover, distance, and tags from `ARTISTS` instead of neutral defaults.
3. Implemented the minimal mapper and type-import changes.
4. Re-ran `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts`.
   - Result: PASS, 2 tests passed.

## Final verification

- `npm --prefix frontend test` — PASS, 23 files and 68 tests.
- `npm --prefix frontend run typecheck` — PASS.
- `git diff --check` — PASS.
- `rg -n "@/assets/artists|assets/artists|\\bARTISTS\\b" frontend/src` — no matches.

## Scope

The unrelated `.playwright-cli` log and the parent task's untracked design/plan files were not staged or included.

## Review follow-up: unsupported public-profile claims

### Test-first evidence

1. Extended `public tech profile mapping > uses neutral display values when the API profile has no optional marketplace data` in `frontend/src/services/__tests__/profiles.test.ts` before changing production code. The incomplete API profile now includes one public review and asserts that the mapped artist has no `type`, `available`, or `featured` value and that the review contains only API-backed `rating`, `text`, and formatted `date` fields.
2. Ran `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts` before the implementation.
   - Result: expected failure (1 failed, 1 passed). The mapper returned the unsupported `name: "Verified Client"` and `initials: ""` review fields; the same pre-change mapper also inferred a tech type, `available: true`, and featured status.
3. Removed category inference, universal availability, rating-derived featured status, and the synthetic verified-reviewer fields from `mapTechProfileToArtist`. Made those presentation fields optional and updated marketplace/profile rendering to omit absent category and reviewer-identity UI instead of inventing labels.
4. Re-ran `npm --prefix frontend test -- src/services/__tests__/profiles.test.ts`.
   - Result: PASS, 2 tests passed.
