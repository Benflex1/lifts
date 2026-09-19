# Exercise Library Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Give every bundled exercise a local static visual, written instructions, primary/secondary muscle metadata, and a form-reference link, with role-aware muscle analytics and native/web persistence compatibility.

**Architecture:** Keep exercise visuals and fallback YouTube links as deterministic runtime resolvers. Approved open illustrations are selected through a local manifest; unmatched exercises render an SVG template based on movement metadata, so browsing remains offline and no proprietary media is bundled. Enriched exercise definitions are synchronized by ID into both stores, while analytics resolves the current catalog before stale embedded workout definitions.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, react-native-svg, SQLite migrations through expo-sqlite, IndexedDB, Node node:test, and the existing dialog/storage abstractions.

**Spec:** docs/superpowers/specs/2026-09-14-exercise-library-foundation-design.md

## Global Constraints

- Do not add GymVisual, ExerciseDB, MuscleWiki, WorkoutX, RepDB, or other unverified third-party exercise media to the repository.
- Bundled visuals must be local and offline-capable; no remote image API or required network request may be introduced.
- Keep secondaryMuscles and instructions optional in the TypeScript interface for legacy compatibility, but normalize missing values to arrays at store boundaries.
- Empty secondary-muscle arrays are valid only for reviewed isolated movements; bundled records must never contain undefined or null for the field.
- Preserve custom exercises, workouts, routines, drafts, scopes, settings, backups, and imports.
- Use the existing write queue and migration failure-injection conventions for native writes.
- Use test-first development for every new resolver, aggregator, migration, and user-visible behavior.
- Keep web free of native-only imports and verify npx expo export --platform web.
- Do not implement animations, bundled videos, 3D models, or advanced exercise metrics in this plan.

---

## Task 1: Extend the exercise contract and catalog validation

**Files:**
- Modify: src/types/index.ts
- Modify: src/database/snapshot-validation.ts
- Modify: src/database/seedData.ts
- Modify: src/database/defaultExercises.json
- Modify: tests/unit/seed-data.test.ts
- Create: tests/unit/exercise-contract.test.ts

**Interfaces:**
- Add optional Exercise.instructionUrl?: string and Exercise.instructionUrlType?: 'website' | 'youtube'.
- Export BUNDLED_EXERCISE_CATALOG_VERSION = 2 from seedData.ts.

- [ ] **Step 1: Write failing catalog invariant tests**

Add tests that iterate over DEFAULT_EXERCISES and assert:

~~~ts
assert.equal(DEFAULT_EXERCISES.length, 876);
assert.ok(ex.secondaryMuscles !== undefined);
assert.ok(Array.isArray(ex.secondaryMuscles));
assert.ok(Array.isArray(ex.instructions));
assert.ok(ex.instructions.length > 0);
~~~

Also add validation tests for valid absolute HTTP(S) URLs, invalid URL types, and malformed URLs.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

~~~bash
npx tsx --test tests/unit/seed-data.test.ts tests/unit/exercise-contract.test.ts
~~~

Expected: failure because five bundled exercises lack instructions and the exercise validator does not yet validate instruction-link fields.

- [ ] **Step 3: Add the additive type/version contract**

Add the optional URL fields without making legacy fixture objects invalid:

~~~ts
instructionUrl?: string;
instructionUrlType?: 'website' | 'youtube';
~~~

Export:

~~~ts
export const BUNDLED_EXERCISE_CATALOG_VERSION = 2;
~~~

Extend validateExerciseRecord() to reject non-string URLs, URLs that are not absolute http/https URLs, unsupported URL types, and a URL type that contradicts a YouTube URL. Leave legacy omission accepted.

- [ ] **Step 4: Normalize the five missing instruction records**

Update only the five records with empty or missing instructions. Use concise, exercise-specific, offline-safe steps authored from the exercise name and equipment. Record authorship/transformation in the provenance document in Task 9. Do not copy text or media from a restricted source.

Ensure every bundled record has an explicit secondaryMuscles array. Preserve an empty array for reviewed isolation exercises rather than inventing a target muscle.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

~~~bash
npx tsx --test tests/unit/seed-data.test.ts tests/unit/exercise-contract.test.ts
~~~

Expected: PASS with exactly 876 unique records and no missing instruction arrays.

- [ ] **Step 6: Commit the catalog contract**

~~~bash
git add src/types/index.ts src/database/snapshot-validation.ts src/database/seedData.ts src/database/defaultExercises.json tests/unit/seed-data.test.ts tests/unit/exercise-contract.test.ts
git commit -m "feat: extend exercise catalog metadata contract"
~~~

## Task 2: Build the local exercise visual resolver and SVG fallback

**Files:**
- Create: src/utils/exercise-media.ts
- Create: src/components/ExerciseVisual.tsx
- Create: tests/unit/exercise-media.test.ts
- Add: only reviewed open illustration assets and their attribution manifest
- Modify: docs/data-provenance.md
- Modify: THIRD_PARTY_NOTICES.md

**Interfaces:**

~~~ts
export type ExerciseVisualTemplate =
  | 'push' | 'pull' | 'squat' | 'hinge' | 'carry'
  | 'core' | 'stretch' | 'cardio' | 'general';

export type ExerciseVisualDescriptor =
  | { kind: 'open-asset'; assetKey: string; alt: string }
  | { kind: 'generated'; template: ExerciseVisualTemplate; alt: string };

export function getExerciseVisual(exercise: Exercise): ExerciseVisualDescriptor;
~~~

ExerciseVisual accepts exercise, size: 'compact' | 'standard' | 'hero', and an optional accessibilityLabel, and renders either an approved local asset or a react-native-svg fallback.

- [ ] **Step 1: Write failing resolver tests**

Test that an exercise with a manifest match returns kind open-asset, an unknown exercise returns kind generated, and representative names/categories select push, pull, squat, hinge, core, stretch, cardio, and general templates. Test that unknown equipment and muscles do not throw.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx tsx --test tests/unit/exercise-media.test.ts
~~~

Expected: failure because the resolver module does not exist.

- [ ] **Step 3: Implement the pure descriptor resolver**

Create an explicit immutable manifest for only reviewed local assets. Normalize name/category/equipment tokens, select the most specific movement template first, and use general for unknown values. Generate alt from the exercise name. Do not put remote image URLs in the descriptor.

- [ ] **Step 4: Implement the SVG component**

Use the existing react-native-svg dependency. Render a neutral figure and equipment/muscle cues with the existing dark theme colors. Keep all dimensions derived from the size variant, set accessible/accessibilityLabel, and ensure the component renders in native and web without computed require() paths.

- [ ] **Step 5: Add only approved open assets**

Import exact open Workout Guide assets that have a verified exercise-ID match. Keep the asset files or package reference local, include CC BY-SA attribution and license text, and record each source/revision/asset mapping. If a match cannot be verified, use the SVG fallback instead.

- [ ] **Step 6: Run the focused tests and web type check**

Run:

~~~bash
npx tsx --test tests/unit/exercise-media.test.ts
npx tsc --noEmit
~~~

Expected: PASS and no native-only import/type errors.

- [ ] **Step 7: Commit the visual foundation**

~~~bash
git add src/utils/exercise-media.ts src/components/ExerciseVisual.tsx tests/unit/exercise-media.test.ts docs/data-provenance.md THIRD_PARTY_NOTICES.md
git add assets/exercises
git commit -m "feat: add offline exercise visuals"
~~~

## Task 3: Add curated and fallback instruction links

**Files:**
- Create: src/utils/exercise-links.ts
- Create: tests/unit/exercise-links.test.ts
- Modify: src/types/index.ts only if the link interface is kept there rather than in the utility module

**Interfaces:**

~~~ts
export interface ExerciseInstructionLink {
  url: string;
  type: 'website' | 'youtube';
  label: string;
  isFallback: boolean;
}

export function getExerciseInstructionLink(exercise: Exercise): ExerciseInstructionLink;
export async function openExerciseInstructionLink(link: ExerciseInstructionLink): Promise<void>;
~~~

- [ ] **Step 1: Write failing link tests**

Cover:

~~~ts
assert.deepEqual(getExerciseInstructionLink({
  ...exercise,
  instructionUrl: 'https://example.com/bench',
  instructionUrlType: 'website',
}), {
  url: 'https://example.com/bench',
  type: 'website',
  label: 'Open exercise guide',
  isFallback: false,
});

const fallback = getExerciseInstructionLink(exerciseWithoutUrl);
assert.equal(fallback.type, 'youtube');
assert.match(fallback.url, /youtube\\.com\\/results\\?search_query=/);
assert.match(decodeURIComponent(fallback.url), /exercise form/);
~~~

Test punctuation, spaces, and non-ASCII exercise names. Test that openExerciseInstructionLink() delegates to the platform-safe Linking.openURL API and propagates an open failure for the caller to display.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx tsx --test tests/unit/exercise-links.test.ts
~~~

Expected: failure because the resolver and opener do not exist.

- [ ] **Step 3: Implement curated URL precedence and YouTube fallback**

Use a curated instructionUrl only when it is valid. Otherwise build:

~~~ts
const query = exercise.name + ' exercise form';
const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
~~~

Return the labels from the spec. Keep the fallback deterministic and do not make network requests while resolving it.

- [ ] **Step 4: Implement the safe opener**

Use React Native's platform-safe URL opener without importing a native-only package. Keep error handling at the UI call site so the utility remains testable.

- [ ] **Step 5: Run tests and commit**

Run:

~~~bash
npx tsx --test tests/unit/exercise-links.test.ts
~~~

Then commit:

~~~bash
git add src/utils/exercise-links.ts tests/unit/exercise-links.test.ts src/types/index.ts
git commit -m "feat: add exercise form reference links"
~~~

## Task 4: Add native SQLite link persistence and catalog synchronization

**Files:**
- Modify: src/database/migrations.ts
- Modify: src/database/nativeStore.ts
- Modify: src/database/db.native.ts
- Modify: tests/integration/native-store.test.ts
- Modify: tests/unit/backup-validation.test.ts only if shared validation fixtures need URL cases

**Interfaces:**
- Native migration 8 adds nullable instruction_url and instruction_url_type columns to exercises.
- Native initialization synchronizes non-custom built-ins by ID to BUNDLED_EXERCISE_CATALOG_VERSION.

- [ ] **Step 1: Write failing migration tests**

Add an existing-database test that applies migrations through version 7, inserts one built-in-like exercise and one custom exercise, runs store.init(), and asserts:

~~~ts
assert.ok(columns.some(column => column.name === 'instruction_url'));
assert.equal((await store.getExerciseById('built-in-id'))?.secondaryMuscles instanceof Array, true);
assert.equal((await store.getExerciseById('custom-id'))?.name, 'User Exercise');
~~~

Add a failure-injection test for version 8 asserting the new columns and migration marker roll back.

- [ ] **Step 2: Run the focused integration test and verify it fails**

Run:

~~~bash
npx tsx --test tests/integration/native-store.test.ts
~~~

Expected: failure because migration 8 and link columns do not exist.

- [ ] **Step 3: Implement migration 8**

Inside one transaction, inspect PRAGMA table_info(exercises), add missing nullable columns, write the catalog-version marker to app_meta, invoke the existing failAtVersion hook after schema/data changes, and insert migration version 8. Re-running migration 8 must not add duplicate columns.

- [ ] **Step 4: Update native row mappings and writes**

Update every native exercise SELECT/mapper and INSERT/UPDATE/upsert path, including default seeding, custom creation, custom editing, snapshot merge, routine joins, and workout joins. Parse null URL fields as omitted properties. Preserve custom rows during catalog synchronization.

- [ ] **Step 5: Implement ID-based built-in synchronization**

After migrations and before returning from init(), compare the stored catalog version. For each DEFAULT_EXERCISES record, update only an existing is_custom = 0 row or insert a missing row. Write the current version only after synchronization succeeds. Invalidate cachedExercises after changes.

- [ ] **Step 6: Run focused integration tests**

Run:

~~~bash
npx tsx --test tests/integration/native-store.test.ts
~~~

Expected: PASS, including existing native migration, custom-exercise, and backup-related tests.

- [ ] **Step 7: Commit native persistence**

~~~bash
git add src/database/migrations.ts src/database/nativeStore.ts src/database/db.native.ts tests/integration/native-store.test.ts
git commit -m "feat: migrate native exercise catalog metadata"
~~~

## Task 5: Add web catalog synchronization and IndexedDB version 4

**Files:**
- Modify: src/database/webStore.ts
- Modify: src/database/db.web.ts
- Modify: tests/integration/web-store.test.ts

**Interfaces:**
- openDb() upgrades from version 3 to version 4.
- Existing exercises object store remains the storage location; metadata stores exercise_catalog_version.

- [ ] **Step 1: Write failing web upgrade tests**

Create a version-3 fixture with one built-in row containing stale secondary/instruction data and one custom row. Initialize the v4 store and assert that the built-in row is updated, the custom row is unchanged, and all existing stores remain present.

- [ ] **Step 2: Run the focused integration test and verify it fails**

Run:

~~~bash
npx tsx --test tests/integration/web-store.test.ts
~~~

Expected: failure because the store still opens version 3 and does not synchronize catalog records.

- [ ] **Step 3: Upgrade IndexedDB and preserve existing records**

Change the open version to 4. Keep all existing stores and upgrade only metadata/exercise contents. Do not create a new media store. Seed missing default exercises, update built-ins by ID, leave isCustom records untouched, set the catalog version, and clear cachedExercises.

- [ ] **Step 4: Preserve writer-lease behavior**

Run catalog synchronization only while the current tab owns the write lease. A read-only tab must not mutate records or metadata and must continue returning existing data.

- [ ] **Step 5: Run the focused integration test and commit**

Run:

~~~bash
npx tsx --test tests/integration/web-store.test.ts
~~~

Then commit:

~~~bash
git add src/database/webStore.ts src/database/db.web.ts tests/integration/web-store.test.ts
git commit -m "feat: synchronize web exercise catalog"
~~~

## Task 6: Preserve links through snapshots, backups, imports, and legacy normalization

**Files:**
- Modify: src/database/contract.ts only if the store update shape needs link fields
- Modify: src/database/snapshot-validation.ts
- Modify: src/utils/backup.ts
- Modify: src/utils/restore.ts
- Modify: src/database/nativeStore.ts
- Modify: src/database/webStore.ts
- Modify: src/database/db.native.ts
- Modify: src/database/db.web.ts
- Modify: tests/integration/backup-roundtrip.test.ts
- Modify: tests/unit/backup-validation.test.ts
- Modify: tests/unit/csv-exercise-mapper.test.ts if imported definitions need explicit fallback assertions

**Interfaces:**
- Legacy backups without URL fields remain accepted.
- V3 backup round trips preserve curated instruction links.

- [ ] **Step 1: Write failing backup and normalization tests**

Add a round-trip exercise with a curated website URL and assert the restored exercise preserves both URL fields. Add malformed URL/type cases that are rejected. Add a legacy exercise fixture without link fields and assert restore succeeds with a derived-link fallback available at runtime.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

~~~bash
npx tsx --test tests/integration/backup-roundtrip.test.ts tests/unit/backup-validation.test.ts
~~~

Expected: failure for the new malformed-link and round-trip expectations.

- [ ] **Step 3: Extend validation and restore normalization**

Validate optional URL fields using the shared exercise-record rules. Preserve curated fields when present, omit null/undefined values in mapped runtime objects, and retain the existing bundled-definition fallback for missing fields. Do not serialize generated visual descriptors or derived YouTube URLs.

- [ ] **Step 4: Extend custom exercise update shapes**

Allow optional instructionUrl and instructionUrlType through both store adapters and public wrappers. Keep custom editor UI out of this task; custom exercises without a curated link still receive the generated YouTube fallback.

- [ ] **Step 5: Run focused and full unit tests**

Run:

~~~bash
npx tsx --test tests/integration/backup-roundtrip.test.ts tests/unit/backup-validation.test.ts tests/unit/csv-exercise-mapper.test.ts
npm test
~~~

Expected: PASS.

- [ ] **Step 6: Commit compatibility changes**

~~~bash
git add src/database/contract.ts src/database/snapshot-validation.ts src/utils/backup.ts src/utils/restore.ts src/database/nativeStore.ts src/database/webStore.ts src/database/db.native.ts src/database/db.web.ts tests/integration/backup-roundtrip.test.ts tests/unit/backup-validation.test.ts tests/unit/csv-exercise-mapper.test.ts
git commit -m "feat: preserve exercise links across storage and backups"
~~~

## Task 7: Make muscle-frequency analytics role-aware

**Files:**
- Modify: src/workout/analytics.ts
- Modify: src/screens/AnalyticsScreen.tsx
- Modify: tests/unit/analytics.test.ts

**Interfaces:**

~~~ts
export interface MuscleFrequencyPoint {
  muscle: string;
  primaryCount: number;
  secondaryCount: number;
  count: number;
}

export interface MuscleFrequencyOptions {
  exerciseCatalog?: readonly Exercise[];
  limit?: number;
}

export function buildMuscleFrequency(
  workouts: Workout[],
  options?: MuscleFrequencyOptions,
): MuscleFrequencyPoint[];
~~~

- [ ] **Step 1: Write failing analytics tests**

Extend the existing fixture to include secondary muscles and a catalog override:

~~~ts
const catalog = [{ ...staleEmbeddedExercise, secondaryMuscles: ['triceps'] }];
assert.deepEqual(buildMuscleFrequency(workouts, { exerciseCatalog: catalog }), [
  { muscle: 'chest', primaryCount: 2, secondaryCount: 0, count: 2 },
  { muscle: 'triceps', primaryCount: 0, secondaryCount: 2, count: 2 },
]);
~~~

Also test duplicate exercises in one workout, a muscle appearing in both roles, incomplete sets, and the limit option.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx tsx --test tests/unit/analytics.test.ts
~~~

Expected: failure because the current point shape only contains muscle/count and ignores secondary roles.

- [ ] **Step 3: Implement catalog-aware role aggregation**

Build a catalog map by exerciseId. For each workout, maintain separate primary/secondary sets, normalize names, skip exercises with no completed sets, and increment each role at most once per workout. Return count = primaryCount + secondaryCount, sort by total then name, and apply limit.

- [ ] **Step 4: Update AnalyticsScreen data flow**

Pass allExerciseList into buildMuscleFrequency() during initial load and CSV-import refresh. Update the chart subtitle and render two colors in each muscle row with a Primary/Secondary legend. Preserve empty/loading states and existing responsive layout.

- [ ] **Step 5: Run focused and full unit tests**

Run:

~~~bash
npx tsx --test tests/unit/analytics.test.ts
npm test
~~~

Expected: PASS with no regressions in progression, trophy, or gym analytics.

- [ ] **Step 6: Commit role-aware analytics**

~~~bash
git add src/workout/analytics.ts src/screens/AnalyticsScreen.tsx tests/unit/analytics.test.ts
git commit -m "feat: include secondary muscles in analytics"
~~~

## Task 8: Add visuals and links to exercise-facing UI

**Files:**
- Modify: src/screens/ExercisesScreen.tsx
- Modify: src/components/ExercisePickerModal.tsx
- Modify: src/components/RoutineEditorModal.tsx
- Modify: src/components/ExerciseDetailModal.tsx
- Modify: src/screens/ActiveWorkoutScreen.tsx
- Modify: src/context/DialogContext.tsx only if the existing dialog API cannot show link errors

**Interfaces:**
- All screens consume ExerciseVisual and getExerciseInstructionLink() without knowing asset licensing details.

- [ ] **Step 1: Add UI assertions for link labels and fallback behavior**

Extend existing component-oriented tests or add pure render-helper assertions so a curated website link produces Open exercise guide, a direct YouTube link produces Watch form video, and a missing link produces Find form videos on YouTube. Ensure a missing visual mapping does not remove the exercise row.

- [ ] **Step 2: Run the focused UI-related test suite and verify failure**

Run:

~~~bash
npm test
~~~

Expected: the new assertions fail because the shared visual and link action are not wired into the screens.

- [ ] **Step 3: Update exercise library rows**

Replace the dumbbell-only leading icon in ExercisesScreen and ExercisePickerModal with compact ExerciseVisual instances. Keep row height within existing touch-target constraints. Add a truncated secondary label or +N secondary text without changing search/filter behavior.

- [ ] **Step 4: Update routine and active-workout rows**

Add compact visuals to RoutineEditorModal and ActiveWorkoutScreen. Keep set-entry controls, drag/drop behavior, supersets, PR badges, and exercise-selection touch targets unchanged.

- [ ] **Step 5: Update exercise detail**

Render the standard/hero visual above the exercise name, keep full primary/secondary labels, and add the external form-reference button below written instructions. Call openExerciseInstructionLink() from the button and show a non-blocking dialog on failure.

- [ ] **Step 6: Run TypeScript and web export**

Run:

~~~bash
npx tsc --noEmit
npx expo export --platform web --output-dir /tmp/lifts-exercise-library-web
~~~

Expected: no type errors, no native module resolution errors, and a successful web export.

- [ ] **Step 7: Commit the UI integration**

~~~bash
git add src/screens/ExercisesScreen.tsx src/components/ExercisePickerModal.tsx src/components/RoutineEditorModal.tsx src/components/ExerciseDetailModal.tsx src/screens/ActiveWorkoutScreen.tsx src/context/DialogContext.tsx
git commit -m "feat: surface exercise visuals and form links"
~~~

## Task 9: Document provenance and update product documentation

**Files:**
- Modify: docs/data-provenance.md
- Modify: THIRD_PARTY_NOTICES.md
- Modify: ROADMAP.md
- Modify: README.md
- Create: docs/exercise-library-sources.md

- [ ] **Step 1: Write the source registry**

Create a table with exercise ID/range, source URL, source revision/date, fields used, transformation, license, attribution requirement, and whether the record uses an open asset or generated fallback. Explicitly record the five authored instruction updates and the handling of reviewed empty secondary arrays.

- [ ] **Step 2: Update notices and provenance**

Add Workout Guide attribution/license details only for assets actually included. Document that generated SVG visuals are authored by Lifts and that fallback YouTube URLs are derived, not downloaded media. Keep the existing Free Exercise DB image exclusion warning.

- [ ] **Step 3: Update roadmap and README claims**

Describe the delivered capability as offline static exercise visuals, written instructions, primary/secondary muscle analytics, and external form references. Keep animation/rich media marked as future work. Do not claim complete Lyfta/Hevy media parity.

- [ ] **Step 4: Verify documentation consistency**

Run:

~~~bash
rg -n "876|animation|visual|secondary|instruction|Workout Guide|GymVisual" README.md ROADMAP.md docs/data-provenance.md docs/exercise-library-sources.md THIRD_PARTY_NOTICES.md
~~~

Confirm no document says all exercise animations are bundled or that excluded upstream images are legally included.

- [ ] **Step 5: Commit documentation**

~~~bash
git add docs/data-provenance.md docs/exercise-library-sources.md THIRD_PARTY_NOTICES.md ROADMAP.md README.md
git commit -m "docs: record exercise library sources and scope"
~~~

## Task 10: Complete compatibility and release verification

**Files:**
- Modify only files needed to correct test failures found during verification.
- Test: tests/unit/*.test.ts
- Test: tests/integration/*.test.ts

- [ ] **Step 1: Run the complete unit suite**

~~~bash
npm test
~~~

Expected: all unit tests pass, including catalog, media, link, analytics, backup, import, and existing health/gym/workout tests.

- [ ] **Step 2: Run the complete integration suite**

~~~bash
npm run test:integration
~~~

Expected: all native/web persistence, migration, backup, draft, completion, and health-ledger tests pass.

- [ ] **Step 3: Run static and platform-safe checks**

~~~bash
npx tsc --noEmit
npx expo-doctor
npx expo export --platform web --output-dir /tmp/lifts-exercise-library-web-final
git diff --check
~~~

Expected: zero TypeScript errors, all Expo Doctor checks pass, web export succeeds, and no whitespace errors exist.

- [ ] **Step 4: Perform manual web/Android acceptance**

Verify:

1. Exercise list shows a visual for several open-asset and generated-fallback records.
2. Exercise detail shows the picture, written steps, primary/secondary muscles, and opens the fallback YouTube search.
3. Picker, routine editor, and active workout show compact visuals without breaking set entry or drag/drop.
4. Analytics shows distinct primary and secondary bars and old workouts use the current catalog metadata.
5. A curated link failure displays a non-blocking error.
6. Existing custom exercises retain their content and still use fallback visuals/links.

- [ ] **Step 5: Inspect final diff and status**

~~~bash
git diff HEAD~10..HEAD --stat
git status --short --branch
~~~

Confirm only the exercise-library changes are present, no restricted media files were added, and all planned commits are on the feature branch.
