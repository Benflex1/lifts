# Data & Asset Provenance

This document tracks the origin, license status, transformation history, and distribution requirements for all bundled data and static assets in the Lifts project.

## 1. Bundled Exercise Dataset (`src/database/defaultExercises.json`)

- **Description**: A collection of 876 resistance training exercises including IDs, exercise names, movement categories, equipment tags, primary/secondary muscles, and step-by-step instructions.
- **Repository Addition**: Added in commit `0aec415fc33d65ecb95b0005ccc7e905bf7469e9` (September 2026).
- **Verified upstream source**: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f), revision `a859101d633a01c4a1a920d6a8ce41dabba0705f`, file [`dist/exercises.json`](https://raw.githubusercontent.com/yuhonas/free-exercise-db/a859101d633a01c4a1a920d6a8ce41dabba0705f/dist/exercises.json).
- **Credited upstream origin**: The yuhonas README credits [`wrkout/exercises.json`](https://github.com/wrkout/exercises.json/tree/5994bea047eee4d39a2c0872be3dd8fdd258ba31) as the original dataset and says that yuhonas restructured it. The credited repository publishes the dataset as public domain/Unlicense material.
- **Transformations**:
  - Retained the upstream 876-record order and IDs, names, categories, primary/secondary muscles, and instructions.
  - Normalized the 77 upstream records whose equipment value is `null` to `"body only"` for the app's required string field.
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
