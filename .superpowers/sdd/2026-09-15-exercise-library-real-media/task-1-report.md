# Task 1 Report

## Changes

- Added `src/database/exercise-source.ts` with the pinned Free Exercise DB revision, repository URL, encoded guide URL constructor, and deterministic runtime `0.jpg` / `1.jpg` URL constructor.
- Enriched all 876 `DEFAULT_EXERCISES` records with a pinned website `instructionUrl` and bumped `BUNDLED_EXERCISE_CATALOG_VERSION` from 2 to 3.
- Updated instruction-link resolution so valid curated website and YouTube links remain highest priority, invalid or missing links on bundled IDs use the pinned source guide, and custom exercises retain the YouTube search fallback.
- Updated unit coverage for source URL construction, catalog enrichment, bundled-link fallback, and custom fallback behavior.
- Updated source documentation to describe runtime public-domain photographs and the non-vendored, non-animated scope accurately.

## Verification

- `npm test -- --test-name-pattern='Seed Data Integrity|exercise instruction links'` — 388 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Caveats and decisions

- Image URLs use `raw.githubusercontent.com`, while guide URLs use the pinned GitHub record pages, matching the source repository layout and spec.
- The two photographs are referenced remotely at runtime; no upstream image files were downloaded or added.
- The pre-existing untracked plan/spec files were left untouched.
