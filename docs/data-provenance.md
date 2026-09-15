# Data & Asset Provenance

This document tracks the origin, license status, transformation history, and distribution requirements for all bundled data and static assets in the Lifts project.

The exercise-library foundation delivered in September 2026 is limited to structured exercise metadata, written instructions, role-aware primary/secondary muscle data, local static visuals, and runtime-derived external form references. It does not bundle exercise animations, videos, or upstream exercise images.

## 1. Bundled Exercise Dataset (`src/database/defaultExercises.json`)

- **Description**: A collection of 876 resistance training exercises including IDs, exercise names, movement categories, equipment tags, primary/secondary muscles, and step-by-step instructions.
- **Repository Addition**: Added in commit `0aec415fc33d65ecb95b0005ccc7e905bf7469e9` (September 2026).
- **Verified upstream source**: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f), revision `a859101d633a01c4a1a920d6a8ce41dabba0705f`, file [`dist/exercises.json`](https://raw.githubusercontent.com/yuhonas/free-exercise-db/a859101d633a01c4a1a920d6a8ce41dabba0705f/dist/exercises.json).
- **Credited upstream origin**: The yuhonas README credits [`wrkout/exercises.json`](https://github.com/wrkout/exercises.json/tree/5994bea047eee4d39a2c0872be3dd8fdd258ba31) as the original dataset and says that yuhonas restructured it. The credited repository publishes the dataset as public domain/Unlicense material.
- **Transformations**:
  - Retained the upstream 876-record order and IDs, names, categories, primary/secondary muscles, and instructions for 871 records.
  - Replaced the five empty upstream instruction arrays with Lifts-authored, concise, exercise-specific, offline-safe steps for `Iron_Cross`, `One-Arm_Kettlebell_Swings`, `Push_Press`, `Side_Bridge`, and `Side_Jackknife`. No external exercise text was copied.
  - Normalized the 77 upstream records whose equipment value is `null` to `"body only"` for the app's required string field.
  - Reviewed all 272 records with empty `secondaryMuscles` arrays. Empty arrays remain explicit where the reviewed record has no meaningful secondary target; no secondary muscle was inferred solely to fill the field.
  - Bundled only the structured exercise JSON; no upstream exercise images or videos are included.
- **Verification snapshot (2026-09-09)**:
  - Local record count: `876`.
  - Local `src/database/defaultExercises.json` SHA-256: `580dc48d26f48fe15bec8b03a4028d4a4497cc142708988e35f04fc265c62f78`.
  - Upstream `dist/exercises.json` SHA-256 at the recorded revision: `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`.
  - All local IDs and ordering match upstream; all fields match except the documented equipment normalization.
- **Licensing & Legal Status**:
  - The upstream [`yuhonas` license](https://github.com/yuhonas/free-exercise-db/blob/a859101d633a01c4a1a920d6a8ce41dabba0705f/LICENSE.md) is the Unlicense, including an explicit public-domain dedication and permission to copy, modify, publish, use, sell, and distribute.
  - The credited [`wrkout` repository](https://github.com/wrkout/exercises.json/blob/5994bea047eee4d39a2c0872be3dd8fdd258ba31/package.json) identifies the dataset license as Public Domain; its repository is also distributed under the Unlicense.
  - The Unlicense text is bundled at [`licenses/UNLICENSE`](../licenses/UNLICENSE), and the attribution/provenance notice is recorded in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
  - **Status**: Resolved for the bundled structured exercise JSON. The upstream repositories separately warn that their exercise images were scraped from the internet; Lifts does not bundle those images. Any future image/video import requires a separate rights review.

### 1.1 Catalog enrichment record

The five instruction updates were authored in commit [`fbaf4b5cc6a87fde2eb267497c966d41f3ae1b89`](https://github.com/Benflex1/lifts/commit/fbaf4b5cc6a87fde2eb267497c966d41f3ae1b89), dated 2026-09-15. Their source is the exercise name and equipment already present in the bundled catalog, not a copied third-party instruction source. The explicit empty-secondary review was completed with the catalog contract changes in commits [`fbaf4b5cc6a87fde2eb267497c966d41f3ae1b89`](https://github.com/Benflex1/lifts/commit/fbaf4b5cc6a87fde2eb267497c966d41f3ae1b89) and [`414a658a79773be84f7662caa782b2e8f6863483`](https://github.com/Benflex1/lifts/commit/414a658a79773be84f7662caa782b2e8f6863483), dated 2026-09-15. These are Lifts-authored metadata transformations under the repository's MIT license; no external attribution is required for the authored text.

## 2. Default Seed Routines (`src/database/seedData.ts`)

- **Description**: Seed workout routines created on first launch (Push, Pull, Legs).
- **Origin**: Authored directly for the Lifts project based on standard, non-copyrightable barbell/dumbbell strength training splits.
- **License**: MIT License (same as project repository).

## 3. Shipped Static Image Assets (`assets/`)

- `assets/icon.png`: App launcher icon.
- `assets/android-icon-foreground.png`, `assets/android-icon-background.png`, `assets/android-icon-monochrome.png`: Android adaptive launcher icon layers.
- `assets/splash-icon.png`: Launch splash screen graphic.
- `assets/favicon.png`: Web application favicon.
- **Origin**: Generated using project brand colors and public/custom vector gym dumbbell artwork.
- **License**: MIT License (same as project repository).

## 4. UI Iconography

- **Library**: `lucide-react-native`
- **Origin**: Lucide project (https://lucide.dev)
- **License**: ISC License (see `THIRD_PARTY_NOTICES.md`).

## 5. Exercise Visuals

- **Generated visuals**: All 876 catalog records resolve to a local static visual descriptor. `Plank` uses the one reviewed open asset below; the other 875 records use a Lifts-authored, local, deterministic `react-native-svg` fallback selected from exercise metadata. It is an application rendering, not a claim that the generic pose exactly depicts every exercise variation. No animation is bundled.
- **Reviewed open asset**: `assets/exercises/workout-guide-plank-frame-1.svg` is mapped only from the local catalog ID `Plank` to Workout Guide's manifest entry `exercise-plank` / `plank` after an exact exercise-name match.
- **Source and revision**: [`bryllim/workout-guide`](https://github.com/bryllim/workout-guide), revision `aac599224bb9780305239607ef98540b7e0ce389`, source path `packages/workout-guide/assets/plank/frame-1.svg`.
- **Asset integrity**: SHA-256 `0f65a842d151f80918e4ee45d1a9f659dd5a82e2d9857c9ad6ae06832a872e94`.
- **Attribution and license**: The pinned Workout Guide metadata credits the asset to Bryl Lim under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The local license text is [`licenses/CC-BY-SA-4.0.txt`](../licenses/CC-BY-SA-4.0.txt), and the local mapping and complete attribution metadata are in [`assets/exercises/attribution.json`](../assets/exercises/attribution.json).
- **Distribution**: The asset is vendored locally and rendered through a literal code-owned asset map. No remote image URL, CDN request, or computed `require()` path is used. No other open exercise assets are included until their exercise mapping and license are reviewed.

## 6. External form references

- The default catalog does not bundle curated exercise URLs. Each record receives a deterministic fallback reference derived at runtime as an encoded YouTube search for `<exercise name> exercise form`.
- The fallback is a URL string only: Lifts does not download, cache, re-host, or bundle YouTube videos. A user may choose to open the external search result from the exercise detail UI.
- Optional curated website or direct YouTube links are validated when supplied by another catalog or custom exercise, but their support does not represent bundled third-party media.

See the [exercise-library source registry](exercise-library-sources.md) for the field-level catalog record.
