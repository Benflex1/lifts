# Exercise Library Real Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every bundled exercise real public-domain imagery and a direct website guide while preserving the existing local-first app behavior and deferring animations.

**Architecture:** Pin the existing Free Exercise DB source revision and construct deterministic image/guide URLs from the exact bundled exercise IDs. Persist the guide URL through the existing bundled catalog seed/synchronization path, and render the first remote photograph through React Native `Image` with the existing generated visual as an error/offline fallback. Expose both source image URLs in the visual descriptor for the future gallery/animation slice.

**Tech Stack:** TypeScript, React Native, Expo, `react-native-svg`, React Native `Image`, Node test runner, existing SQLite/IndexedDB catalog synchronization.

**Spec:** `docs/superpowers/specs/2026-09-15-exercise-library-real-media-design.md`

## Global Constraints

- Use Free Exercise DB commit `a859101d633a01c4a1a920d6a8ce41dabba0705f` for all constructed source URLs.
- Preserve the existing 876 bundled exercise IDs and written instructions; do not fuzzy-match or rename records.
- Render `0.jpg` as the current image and expose `1.jpg` in the descriptor for a later gallery/animation slice.
- Keep image loading platform-safe for web, Android, and iOS; do not add a native image dependency.
- Keep custom exercises out of the bundled-source guarantee and preserve their current YouTube fallback behavior when no curated link exists.
- Generated visuals are only an offline/error fallback and must not be returned as the normal visual for a bundled record.
- Keep the source attribution and license notes in `docs/exercise-library-sources.md` accurate.
- Use no more than one implementation fix round per task and no more than one scoped re-review per task.

### Task 1: Pin the source and enrich bundled metadata

**Files:**
- Create: `src/database/exercise-source.ts`
- Modify: `src/database/seedData.ts`
- Modify: `src/utils/exercise-links.ts`
- Modify: `tests/unit/seed-data.test.ts`
- Modify: `tests/unit/exercise-links.test.ts`
- Modify: `docs/exercise-library-sources.md`

**Interfaces:**
- Produces `FREE_EXERCISE_DB_REVISION`, `FREE_EXERCISE_DB_REPOSITORY_URL`, `getFreeExerciseDbImageUrls(exerciseId: string): readonly [string, string]`, and `getFreeExerciseDbGuideUrl(exerciseId: string): string`.
- Produces an enriched `DEFAULT_EXERCISES` array whose bundled records carry `instructionUrl` and `instructionUrlType: 'website'`.
- Existing direct curated website and YouTube links remain the highest-priority link inputs.

- [ ] **Step 1: Write failing source/seed/link tests.**
  - Assert the source revision and URL constructors are deterministic, URL-encode IDs, and produce the two expected `.jpg` URLs.
  - Assert all 876 bundled records have a pinned website `instructionUrl` and `instructionUrlType === 'website'`.
  - Assert a bundled record returns `Open exercise guide` for its source page, including when its stored link is missing or invalid.
  - Assert custom missing-link behavior still returns the existing YouTube search fallback.
- [ ] **Step 2: Run the focused tests and confirm the new assertions fail.**
- [ ] **Step 3: Implement the source module and seed enrichment.**
  - Keep URL construction pure and independent of storage.
  - Increment `BUNDLED_EXERCISE_CATALOG_VERSION` from `2` to `3` so existing native/web installations receive the new bundled links through the already-existing sync path.
- [ ] **Step 4: Update link resolution and source documentation.**
  - Use the pinned source guide for bundled IDs before falling back to YouTube.
  - Document that the two images are runtime remote assets from the public-domain source; do not claim they are vendored or animated.
- [ ] **Step 5: Run focused seed/link tests, then commit.**

**Verification:** `npm test -- --test-name-pattern='Seed Data Integrity|exercise instruction links'` (or the repository-equivalent focused command), plus `git diff --check`.

### Task 2: Render real remote exercise imagery with resilient fallback

**Files:**
- Modify: `src/utils/exercise-media.ts`
- Modify: `src/components/ExerciseVisual.tsx`
- Modify: `src/utils/exercise-ui.ts` only if descriptor typing requires it
- Modify: `tests/unit/exercise-media.test.ts`
- Modify: `tests/unit/exercise-ui.test.ts`
- Modify: `docs/exercise-library-sources.md` if Task 1 did not finish the visual-resolution section

**Interfaces:**
- Extends `ExerciseVisualDescriptor` with a `remote-image` variant containing `imageUrl`, `imageUrls`, `alt`, and the deterministic fallback template.
- `getExerciseVisual` returns `remote-image` for every ID in the bundled catalog and retains `generated` for unknown/custom exercises.

- [ ] **Step 1: Write failing resolver tests.**
  - Assert representative and complete-catalog bundled records return `remote-image`, not `generated`.
  - Assert both image URLs use the pinned source revision and exact exercise ID.
  - Assert unknown/custom exercises remain deterministic and generated.
- [ ] **Step 2: Run focused visual tests and confirm failure.**
- [ ] **Step 3: Implement the remote descriptor.**
  - Use the source module's URL constructor and the bundled ID set; do not derive URLs for arbitrary custom IDs.
  - Preserve the existing explicit local Plank asset as an available fallback/provenance asset, but do not use generated art as the normal bundled result.
- [ ] **Step 4: Update `ExerciseVisual` to render `Image`.**
  - Add a small stateful remote-image renderer that uses the first image URL, `resizeMode="contain"`, the existing dimensions, and the descriptor alt text.
  - On load failure, render the descriptor's generated fallback through the existing error boundary. Do not let a failed remote request throw through the picker or detail modal.
  - Keep all imports compatible with Expo web and native targets.
- [ ] **Step 5: Run focused visual/UI tests and a manual URL check.**
  - Confirm a real sample URL returns an image and a sample guide URL returns the source record page.
  - Commit the task.

**Verification:** `npm test -- --test-name-pattern='exercise visual resolver|exercise UI view models'`, `npx tsc --noEmit`, and `git diff --check`.

### Task 3: Whole-branch verification and review

**Files:**
- No planned source changes; only fix files identified by review if necessary.

- [ ] **Step 1: Run the full unit and integration suites.**
- [ ] **Step 2: Run TypeScript and Expo web export checks.**
- [ ] **Step 3: Inspect the final diff for source/license accuracy, remote URL stability, and absence of accidental media downloads.
- [ ] **Step 4: Perform one broad review and, if needed, one scoped fix/re-review round.**

**Verification:** `npm test`, `npm run test:integration`, `npx tsc --noEmit`, `npx expo-doctor`, `npx expo export --platform web`, `git diff --check`, and `git status --short`.

