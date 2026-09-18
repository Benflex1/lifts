# Exercise Guide Link Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make exercise-guide buttons open a human-facing MuscleWiki guide when a verified mapping exists, use YouTube search otherwise, and never expose GitHub as a user guide.

**Architecture:** Keep the local Free Exercise DB revision as internal image/provenance data only. Add a small immutable registry of verified MuscleWiki exercise slugs keyed by bundled exercise ID; unmapped bundled and custom records resolve to the deterministic YouTube form search unless they already have a valid non-GitHub curated URL. Bump the bundled catalog version so existing local rows replace legacy GitHub guide URLs during normal synchronization.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, SQLite/IndexedDB bundled catalog synchronization, Node test runner.

**Spec:** docs/superpowers/plans/2026-09-14-exercise-library-foundation.md, plus the approved MuscleWiki guide-link decision from the 2026-09-18 implementation discussion.

## Global Constraints

- User-facing exercise guides must never use `github.com`, `www.github.com`, or any GitHub subdomain.
- MuscleWiki links must be direct human-facing `/exercise/<slug>` pages; do not call or scrape the paid MuscleWiki API and do not copy MuscleWiki text, images, or videos into the repository.
- Keep Free Exercise DB GitHub URLs only where needed for internal source/media provenance; no resolver or seed record may return its GitHub guide URL.
- Preserve valid custom website and YouTube links unless the URL is a GitHub URL; invalid, missing, or rejected links use the deterministic YouTube search fallback.
- Keep the web target free of native-only imports and preserve the existing synchronous `Linking.openURL` user-gesture behavior.
- Use TDD and change the catalog version so stale persisted GitHub guide URLs are overwritten for built-in exercises.

## Task 1: Replace GitHub guide links with verified MuscleWiki links and YouTube fallback

**Files:**
- Create: `src/database/exercise-guides.ts`
- Modify: `src/database/seedData.ts`
- Modify: `src/utils/exercise-links.ts`
- Modify: `src/database/exercise-source.ts`
- Modify: `tests/unit/exercise-links.test.ts`
- Modify: `tests/unit/seed-data.test.ts`
- Modify: `tests/integration/native-store.test.ts`
- Modify: `tests/integration/web-store.test.ts` or the existing web catalog-sync test file
- Modify: `docs/data-provenance.md`

**Interfaces:**

```ts
export const MUSCLEWIKI_GUIDE_BASE_URL = 'https://musclewiki.com';
export function getMuscleWikiGuideUrl(exerciseId: string): string | undefined;
```

The registry is keyed by exact bundled exercise ID and returns `undefined` for an unverified match. Every returned URL is a direct `/exercise/<slug>` page, not a search page or API endpoint.

- [ ] **Step 1: Add failing behavior tests**

Extend the focused link tests with these behaviors:

```ts
assert.equal(
  getExerciseInstructionLink({ ...bundledBenchPress, instructionUrl: undefined, instructionUrlType: undefined }).url,
  'https://musclewiki.com/exercise/barbell-bench-press',
);
assert.equal(getExerciseInstructionLink(unmappedBundledExercise).type, 'youtube');
assert.match(getExerciseInstructionLink(unmappedBundledExercise).url, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
assert.equal(getExerciseInstructionLink({ ...exercise, instructionUrl: 'https://github.com/example/guide', instructionUrlType: 'website' }).type, 'youtube');
assert.doesNotMatch(getExerciseInstructionLink({ ...exercise, instructionUrl: 'https://github.com/example/guide', instructionUrlType: 'website' }).url, /github\.com/i);
```

Add catalog assertions that `DEFAULT_EXERCISES` has no `instructionUrl` containing GitHub and that the verified barbell bench press record contains the MuscleWiki URL.

Add native and web catalog-sync regression tests that a stale built-in record containing the old GitHub guide URL is replaced by the new catalog record after the catalog version changes, while a custom record with the same ID remains untouched.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npx tsx --test tests/unit/exercise-links.test.ts tests/unit/seed-data.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
```

Expected: failure because the seed still produces Free Exercise DB GitHub guide URLs and the resolver still treats them as curated/fallback website links.

- [ ] **Step 3: Implement the verified guide registry and seed wiring**

Create `src/database/exercise-guides.ts` with an immutable explicit registry. Include only direct pages verified during research, beginning with:

```ts
Barbell_Bench_Press_-_Medium_Grip -> https://musclewiki.com/exercise/barbell-bench-press
Barbell_Deadlift -> https://musclewiki.com/exercise/barbell-deadlift
Barbell_Curl -> https://musclewiki.com/exercise/barbell-curl
Dumbbell_Bench_Press -> https://musclewiki.com/exercise/dumbbell-bench-press
Incline_Dumbbell_Press -> https://musclewiki.com/exercise/dumbbell-incline-bench-press
Pushups -> https://musclewiki.com/exercise/push-up
```

Add further entries only when the exact page is verified; do not generate slugs speculatively. Update `DEFAULT_EXERCISES` to spread a MuscleWiki website URL only when `getMuscleWikiGuideUrl(exercise.id)` returns one. Remove the seed dependency on `getFreeExerciseDbGuideUrl` and remove that user-guide helper from `exercise-source.ts` if no internal caller remains. Bump `BUNDLED_EXERCISE_CATALOG_VERSION` from `3` to `4`.

- [ ] **Step 4: Enforce the no-GitHub resolver policy**

Update `isValidCuratedLink` so GitHub hosts and subdomains are rejected for both website and YouTube link types. Keep valid non-GitHub curated URLs highest priority. Remove the bundled Free Exercise DB fallback entirely. For a mapped bundled exercise, the seed URL returns the MuscleWiki page; for unmapped bundled and all missing/invalid records, return the existing YouTube search URL and label `Find form videos on YouTube`.

- [ ] **Step 5: Document provenance and migration semantics**

Update `docs/data-provenance.md` to state that MuscleWiki is linked only as an external human-facing guide, no MuscleWiki content is copied/rehosted, and Free Exercise DB GitHub remains internal provenance/media only. Document that catalog version 4 replaces legacy bundled GitHub guide URLs while preserving custom links.

- [ ] **Step 6: Run focused tests, typecheck, and web export**

Run:

```bash
npx tsx --test tests/unit/exercise-links.test.ts tests/unit/seed-data.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts
npx tsc --noEmit
npx expo export --platform web
```

Expected: all focused tests pass, TypeScript exits with code 0, and the web export completes without native-module errors.

- [ ] **Step 7: Commit the guide-link policy**

```bash
git add src/database/exercise-guides.ts src/database/seedData.ts src/utils/exercise-links.ts src/database/exercise-source.ts tests/unit/exercise-links.test.ts tests/unit/seed-data.test.ts tests/integration/native-store.test.ts tests/integration/web-store.test.ts docs/data-provenance.md docs/superpowers/plans/2026-09-18-exercise-guide-links.md
git commit -m "fix: use human-facing exercise guide links"
```
