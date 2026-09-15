# Task 2 Report

## Changed files

- `src/utils/exercise-media.ts`: added the `remote-image` descriptor and resolve-time allowlisting from the bundled catalog. Both pinned Free Exercise DB image URLs are exposed; `0.jpg` is the primary image and the existing generated template is retained as the deterministic fallback.
- `src/components/ExerciseVisual.tsx`: added a platform-safe React Native `Image` renderer using `contain`, fixed existing dimensions, descriptor alt text, and a stateful load-error fallback to the generated visual inside the existing error boundary.
- `tests/unit/exercise-media.test.ts`: added representative and complete-catalog resolver coverage, pinned revision/URL assertions, custom generated fallback coverage, and local Plank provenance coverage.
- `tests/unit/exercise-ui.test.ts`: added bundled-row remote visual coverage.

`docs/exercise-library-sources.md` already contained the required runtime visual-resolution section, so it was not changed.

## Verification

- `npm test -- --test-name-pattern='exercise visual resolver|exercise UI view models'` — 391 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- Live URL checks: representative `0.jpg` returned HTTP 200 with `content-type: image/jpeg`; representative pinned guide URL returned HTTP 200.

## Decisions and caveats

- The bundled ID allowlist is derived from `DEFAULT_EXERCISES`, so arbitrary custom IDs never receive constructed upstream URLs.
- The local Plank asset remains in the reviewed asset manifest for provenance/fallback availability, but bundled Plank now correctly resolves to its pinned remote image descriptor.
- No upstream photographs were downloaded or bundled.
