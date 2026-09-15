# Exercise Library Real Media Design

**Date:** 2026-09-15  
**Status:** Approved for implementation  
**Scope:** Replace generated exercise-library visuals and YouTube-only fallback links for the bundled catalog.

## Goal

Every bundled exercise in Lifts must expose real exercise imagery, the existing written instructions, primary and secondary muscle metadata, and a direct external website guide. Animations are deliberately deferred to a later slice.

## Source decision

Use the existing upstream source of the 876 bundled records: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db), pinned to commit `a859101d633a01c4a1a920d6a8ce41dabba0705f`.

The source provides two photographs per bundled exercise under `exercises/<id>/0.jpg` and `exercises/<id>/1.jpg`, and its repository documents the dataset and image collection as public-domain/Unlicense. The existing Lifts IDs match the source exercise IDs exactly, so no fuzzy matching or per-record hand-maintained media map is needed.

For the external guide, use the source record page:

`https://github.com/yuhonas/free-exercise-db/blob/a859101d633a01c4a1a920d6a8ce41dabba0705f/exercises/<id>.json`

That page contains the exercise name, instructions, muscle metadata, and image paths. URL path segments must be encoded when constructed.

## Architecture

Keep the source constants and URL constructors in a small source module. Enrich the bundled seed records with the pinned website URL so native and web catalog synchronization persists the link through the existing `instructionUrl` contract. Resolve image URLs from the exercise ID at render time rather than vendoring 1,752 image files into the application.

`ExerciseVisual` will render the first upstream photograph through React Native's platform-safe `Image` component. A failed remote image load falls back to the existing deterministic visual/error boundary; this preserves offline/error resilience without presenting generated art as the normal library image. The second upstream image is exposed by the descriptor for the later gallery/animation slice.

Custom exercises retain their existing custom-link behavior and generated visual fallback unless they provide their own curated link. The bundled-catalog guarantee is the contract for this slice.

## Non-goals

- No exercise animations or frame playback.
- No new native modules or image-cache dependency.
- No replacement of the existing exercise instructions or muscle metadata in this slice.
- No downloading or bundling of upstream photographs.
- No automatic edits to user-created custom exercise media.

## Acceptance criteria

1. `DEFAULT_EXERCISES` contains 876 unique records and every record has non-empty instructions, primary-muscle metadata, and an explicit website `instructionUrl` pointing to its pinned source record.
2. Every bundled record resolves to a `remote-image` descriptor with deterministic `0.jpg` and `1.jpg` URLs at the pinned source revision.
3. Exercise detail and picker visuals render the real remote photograph on web and native builds, with a safe fallback when the image cannot load.
4. Missing/invalid links on bundled records resolve to the pinned source website rather than a YouTube search.
5. Existing direct website and direct YouTube links remain supported; custom exercises without links retain the existing YouTube search fallback.
6. Source documentation no longer claims that all non-Plank visuals are generated or that upstream images are excluded from the delivered library behavior.
7. Unit, integration, TypeScript, and web-export checks remain green.

