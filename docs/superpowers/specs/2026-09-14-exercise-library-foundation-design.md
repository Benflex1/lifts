# Exercise Library Foundation Design Spec

- **Date:** 2026-09-14
- **Status:** Approved design; implementation planning follows review
- **Goal:** Give every bundled exercise a reliable static visual, written instructions, primary and secondary muscle metadata, and an external form-reference link while making primary and secondary targets visible in analytics.
- **Supersedes:** The exercise-media portion of the Phase 4 roadmap entry; animations and rich exercise information remain future work.

## 1. Context

Lifts currently bundles 876 exercise definitions in `src/database/defaultExercises.json`. The definitions already contain names, categories, equipment, primary muscles, secondary-muscle arrays, and instructions, but the media layer is absent and five bundled records have no instructions. All bundled records have a primary-muscle array; 272 currently have an empty secondary-muscle array.

The exercise detail modal already renders instructions and primary/secondary labels. Exercise list, picker, routine, and active-workout surfaces currently use a dumbbell icon instead of exercise media. `buildMuscleFrequency()` in `src/workout/analytics.ts` counts only primary muscles and receives only embedded workout exercise definitions, so later catalog enrichment would not automatically affect older workout records.

The repository is public and Lifts is intended to remain free and local-first. The current provenance record explicitly excludes the scraped upstream exercise images. This release must not add unverified GymVisual, ExerciseDB, MuscleWiki, WorkoutX, or similar media to the repository.

## 2. Goals

- Ensure every bundled exercise has a non-empty written instruction list.
- Ensure every bundled exercise has a `secondaryMuscles` array. An empty array is valid for a genuinely isolated movement; undefined or null is not valid in the bundled catalog.
- Render a static exercise visual for every exercise on the main exercise surfaces.
- Use exact open visual assets when a reviewed source match exists.
- Provide a deterministic, local SVG visual fallback for all unmatched exercises. The fallback is a static form-oriented visual, not a claim that it replaces a professional demonstration.
- Provide one external form-reference action for every exercise. A curated website or direct YouTube URL takes precedence; otherwise Lifts creates a YouTube form-search URL from the exercise name.
- Count primary and secondary muscle roles in the existing muscle-frequency analytics without changing workout volume or strength calculations.
- Make enriched catalog metadata available to historical workouts by resolving definitions by `exerciseId` before falling back to embedded definitions.
- Preserve existing workouts, routines, custom exercises, imports, backups, native SQLite data, web IndexedDB data, and web export behavior.
- Keep all bundled media and authored metadata auditable and redistributable under their stated licenses.

## 3. Non-goals

- Looped animations, videos bundled in the app, anatomical 3D models, Blender workflows, pose estimation, or motion coaching.
- Reading or caching third-party video media.
- A complete redesign of the exercise editor.
- Splitting training volume between primary and secondary muscles.
- Claiming that a generic fallback visual is an exact depiction of every equipment or technique variation.
- Adding a remote image API dependency or making exercise browsing require network access.
- Replacing the current 876-exercise catalog wholesale with an unverified mirror.

## 4. Product behavior

### 4.1 Exercise visual

Create a shared `ExerciseVisual` component. It accepts an `Exercise`, a size variant, and an optional accessibility label. It resolves a local `ExerciseVisualDescriptor` through `src/utils/exercise-media.ts`:

```ts
export type ExerciseVisualTemplate =
  | 'push'
  | 'pull'
  | 'squat'
  | 'hinge'
  | 'carry'
  | 'core'
  | 'stretch'
  | 'cardio'
  | 'general';

export type ExerciseVisualDescriptor =
  | { kind: 'open-asset'; assetKey: string; alt: string }
  | { kind: 'generated'; template: ExerciseVisualTemplate; alt: string };

export function getExerciseVisual(exercise: Exercise): ExerciseVisualDescriptor;
```

The descriptor first checks a reviewed ID-to-asset manifest for open illustrations, such as matching assets from Workout Guide. The manifest is code-owned and deterministic; it must not point at a remote image URL. When there is no approved asset, the descriptor selects a template from the exercise category/name/equipment and renders a local `react-native-svg` illustration containing:

- a neutral human silhouette or movement pose;
- primary and secondary muscle highlights when those groups are available;
- a compact equipment cue where the selected template supports it;
- accessible alternate text based on the exercise name.

The generated visual is an application rendering, not a separate third-party asset. It must remain usable on native and web and never throw when an exercise has an unknown category, equipment value, or muscle name.

Use the shared component in:

- `ExercisesScreen` list rows;
- `ExercisePickerModal` rows;
- `RoutineEditorModal` exercise rows where the current layout permits it;
- `ExerciseDetailModal` hero/detail area;
- `ActiveWorkoutScreen` exercise headers.

The existing icon remains the final rendering fallback if a visual component encounters an unexpected runtime error; the catalog-level resolver itself must always return a descriptor.

### 4.2 Instructions and external form reference

Extend `Exercise` additively:

```ts
instructionUrl?: string;
instructionUrlType?: 'website' | 'youtube';
```

These fields represent an optional curated direct reference. They are not required in every JSON record because the runtime resolver supplies a deterministic fallback:

```ts
export interface ExerciseInstructionLink {
  url: string;
  type: 'website' | 'youtube';
  label: string;
  isFallback: boolean;
}

export function getExerciseInstructionLink(exercise: Exercise): ExerciseInstructionLink;
```

Fallback URL format:

```text
https://www.youtube.com/results?search_query=<exercise name>+exercise+form
```

The detail modal adds an accessible **Open form guide** button. For a curated direct YouTube URL the label is **Watch form video**; for a curated website URL it is **Open exercise guide**; for the fallback it is **Find form videos on YouTube**. Use the platform-safe link opener and show the existing dialog/error mechanism if the URL cannot be opened. Do not embed, download, or cache the linked media.

The existing written instructions remain the primary offline guidance. The external link is a supplementary reference and must not be presented as medical advice or as a guarantee of instructional quality.

### 4.3 Muscle display

The detail modal continues to show the complete primary and secondary lists. Update list, picker, routine, and active-workout compact metadata so secondary targets are discoverable without making rows too tall; a secondary line or a `+N secondary` label is acceptable where space is constrained. The detail view remains the authoritative full display.

### 4.4 Muscle-frequency analytics

Replace the primary-only point shape with:

```ts
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
```

Rules:

1. Only completed sets in the existing completed-workout input count.
2. Resolve the exercise definition from `exerciseCatalog` by `exerciseId` first. If no catalog match exists, use the embedded workout definition.
3. Normalize muscle names by trimming and lowercasing, matching the existing analytics behavior.
4. Within one workout, count a muscle at most once as primary and at most once as secondary, even if several exercises target it.
5. If the same normalized muscle appears in both roles in one workout, increment both role counts; this preserves the distinction instead of silently choosing one role.
6. Set `count = primaryCount + secondaryCount` and sort by descending `count`, then by muscle name. Apply the requested limit after sorting.
7. Do not use secondary muscles to alter weekly volume, estimated 1RM, progression, PRs, or exercise records in this release.

The analytics UI changes the subtitle to explain the two roles and renders a stacked bar or equivalent two-color row with a compact legend for **Primary** and **Secondary**. Existing empty-data and loading behavior remains unchanged.

## 5. Catalog quality and provenance

### 5.1 Required bundled invariants

The catalog validation test must assert for all 876 records:

- unique non-empty ID;
- non-empty name, category, and equipment;
- non-empty `primaryMuscles` array;
- `secondaryMuscles` is an array, with an empty array permitted only where the reviewed catalog record has no meaningful secondary target;
- non-empty `instructions` array;
- any `instructionUrl` is an absolute `http` or `https` URL;
- any `instructionUrlType` is `website` or `youtube` and is consistent with the URL source.

The data enrichment work must fill the five missing instruction records and review the 272 empty secondary arrays. Metadata may be sourced from reviewed open sources such as Longhaul Fitness, Kinetic, and ExerciseAPI, or authored by the project when source text is not reused. Each changed group must be recorded with source URL, revision/date, transformation notes, and license in `docs/data-provenance.md`.

Do not infer media rights from a repository's MIT/Unlicense label when the repository separately attributes images to a third party. The open-asset manifest may include only assets whose file-level license and source are recorded. Workout Guide-derived assets require CC BY-SA 4.0 attribution and must retain the asset license notice. Generated Lifts SVGs are released under the repository's documented open asset license.

### 5.2 Data update strategy

Introduce a bundled catalog version constant, starting at version 2 for this feature. On store initialization:

- seed missing built-in exercises as today;
- update existing non-custom built-in definitions by ID to the current catalog version;
- never overwrite custom exercises;
- preserve user-created routines, workouts, drafts, scopes, and settings;
- invalidate any cached exercise list after synchronization.

Analytics must use the current catalog map so historical workout records with older embedded definitions gain the enriched secondary-muscle data without rewriting historical workout payloads. Drafts and routines read through existing store paths should use the current definition where they already rehydrate from the exercise table; serialized legacy payloads remain valid and are normalized on read.

## 6. Persistence and compatibility

### 6.1 Type and validation changes

Keep `secondaryMuscles` and `instructions` optional in the TypeScript interface for backward compatibility with legacy imports and test fixtures, but normalize missing values to arrays at store boundaries. Bundled catalog validation is stricter than legacy backup validation.

Add optional instruction URL fields to snapshot validation. Legacy backups without those fields remain valid. Invalid URL types, malformed URLs, and non-string values are rejected with the existing validation error style.

### 6.2 Native SQLite

Add native migration 8 after the existing health ledger migration. It adds nullable `instruction_url` and `instruction_url_type` columns to `exercises` when absent and records the catalog version in `app_meta`. The migration is transactional, idempotent, and follows the existing failure-injection convention.

Update all native exercise row mapping, seed, custom-create, custom-update, snapshot-merge, routine/workout joins, and cache paths to round-trip the optional link fields. The built-in catalog synchronization updates only rows with `is_custom = 0`.

### 6.3 Web IndexedDB

Raise the IndexedDB version from 3 to 4. No new object store is required; the existing `exercises` store already stores structured objects. Add catalog-version metadata and synchronize built-in records by ID while preserving custom records. Existing version-3 data must remain readable, and exercise cache invalidation must occur after synchronization.

### 6.4 Backups

Backup Schema v3 remains the current format. Optional instruction-link fields are included automatically in exercise definitions and embedded routine/workout exercise objects. Restore accepts older backups and fills missing fields through the bundled definition/fallback resolver. Generated visual descriptors and derived YouTube fallback URLs are not serialized; they are deterministic runtime behavior. No remote media is added to backup files.

## 7. File responsibilities

### Create

- `src/components/ExerciseVisual.tsx` — shared native/web visual component and size variants.
- `src/utils/exercise-media.ts` — open-asset manifest, template selection, and visual descriptor resolver.
- `src/utils/exercise-links.ts` — curated/fallback link resolution and safe external-link opening.
- `tests/unit/exercise-media.test.ts` — visual resolver, asset fallback, template selection, and malformed metadata cases.
- `tests/unit/exercise-links.test.ts` — curated URL precedence, YouTube fallback, labels, and URL encoding.
- `docs/superpowers/plans/2026-09-14-exercise-library-foundation.md` — implementation plan after this spec is approved.

### Modify

- `src/types/index.ts` — optional instruction-link fields and link types.
- `src/database/defaultExercises.json` — reviewed instruction and secondary-muscle enrichment.
- `src/database/seedData.ts` — catalog version and normalized bundled definitions if needed.
- `src/database/migrations.ts` — native migration 8.
- `src/database/nativeStore.ts` — link-field mapping, catalog synchronization, and writes.
- `src/database/webStore.ts` — IndexedDB version 4 and catalog synchronization.
- `src/database/contract.ts`, `src/database/db.native.ts`, `src/database/db.web.ts` — contract/wrapper parity where link-bearing exercise updates require it.
- `src/database/snapshot-validation.ts`, `src/utils/backup.ts`, `src/utils/restore.ts` — optional link validation and legacy normalization.
- `src/workout/analytics.ts` — role-aware frequency aggregation and catalog resolution.
- `src/screens/AnalyticsScreen.tsx` — catalog-aware aggregation and stacked role presentation.
- `src/screens/ExercisesScreen.tsx` — list visuals and compact secondary metadata.
- `src/components/ExercisePickerModal.tsx` — picker visuals and compact secondary metadata.
- `src/components/RoutineEditorModal.tsx` — routine row visuals/metadata where layout allows.
- `src/components/ExerciseDetailModal.tsx` — hero visual and external form-reference action.
- `src/screens/ActiveWorkoutScreen.tsx` — active exercise visual and compact secondary metadata.
- `tests/unit/analytics.test.ts`, `tests/unit/seed-data.test.ts` — role-aware analytics and catalog invariants.
- `tests/integration/native-store.test.ts`, `tests/integration/web-store.test.ts`, `tests/integration/backup-roundtrip.test.ts` — migration, synchronization, round-trip, and compatibility coverage.
- `docs/data-provenance.md`, `THIRD_PARTY_NOTICES.md`, `ROADMAP.md`, and `README.md` — source/license records and accurate feature claims.

## 8. Error handling and compatibility rules

- A missing or malformed optional visual mapping never prevents an exercise from rendering; use the generated SVG descriptor, then the existing icon as a final UI guard.
- A missing instruction URL never hides written instructions; show the deterministic YouTube search action.
- A failed external-link open shows a non-blocking user-facing error and does not affect workout persistence.
- A catalog synchronization failure must not delete exercises or custom data. The store should retain the previous catalog and surface initialization failure through the existing startup path.
- Old backups and old embedded workout definitions remain readable.
- Native and web must return equivalent exercise objects for the same catalog version.

## 9. Testing and verification

Test-first implementation is required for each new pure resolver/aggregator behavior.

Focused tests must cover:

- all bundled records satisfy the metadata invariants;
- every exercise resolves either an approved open asset or a generated visual descriptor;
- unknown categories/equipment/muscles choose the safe generated fallback;
- curated website and YouTube links take precedence over the YouTube search fallback;
- names with spaces, punctuation, and non-ASCII characters are encoded safely;
- analytics distinguishes primary and secondary counts, deduplicates within a workout, and uses the current catalog over stale embedded definitions;
- migration 8 upgrades an existing native database without changing custom exercises;
- IndexedDB version 4 upgrades existing records and synchronizes only built-ins;
- backup round-trips preserve optional instruction-link fields and do not serialize derived media descriptors;
- web export still compiles with no native-only media imports.

Before completion, run the repository's full unit/integration test commands, TypeScript checking, Expo doctor, and web export. Inspect the rendered web exercise list/detail and analytics surfaces for visual overflow and verify external-link actions on web and Android; iOS manual testing remains unavailable in the current environment.

## 10. Acceptance criteria

The slice is complete when:

1. Every bundled exercise renders a local static picture/illustration.
2. Every bundled exercise has non-empty written instructions.
3. Every bundled exercise has primary and secondary muscle arrays, with empty secondary arrays only where anatomically justified and documented.
4. The detail view clearly displays primary and secondary muscles.
5. Primary and secondary roles appear separately in muscle-frequency analytics.
6. Every exercise exposes a working curated or fallback form-reference link.
7. Existing custom exercises, imported exercises, workouts, routines, drafts, backups, and history remain compatible.
8. No unlicensed third-party exercise media is bundled or re-hosted.
9. Native SQLite and web IndexedDB stay in parity.
10. All automated checks pass and the web build remains clean.

