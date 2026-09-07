# Data & Asset Provenance

This document tracks the origin, license status, transformation history, and distribution requirements for all bundled data and static assets in the Lifts project.

## 1. Bundled Exercise Dataset (`src/database/defaultExercises.json`)

- **Description**: A collection of 876 resistance training exercises including IDs, exercise names, movement categories, equipment tags, primary/secondary muscles, and step-by-step instructions.
- **Repository Addition**: Added in commit `0aec415fc33d65ecb95b0005ccc7e905bf7469e9` (September 2026).
- **Origin**: Derived from widely circulated community exercise databases (such as `yuhonas/free-exercise-db` and fitness forum archives originally transcribed from bodybuilding.com public exercise guides).
- **Transformations**:
  - Normalized IDs to alphanumeric strings with underscores (e.g. `Barbell_Bench_Press_-_Medium_Grip`).
  - Standardized muscle group categorizations and equipment taxonomies.
  - Formatted instructions into structured JSON string arrays.
- **Licensing & Legal Status**:
  - The dataset has historically circulated under community open-source mirrors. However, an unambiguous upstream copyright assignment or formal SPDX open-source license grant from the original authors of the text descriptions is not established.
  - **Distribution Blocker**: For commercial distribution or binary publication on app stores (Google Play, Apple App Store), this dataset must undergo a formal legal review or be replaced with an explicitly licensed CC0 or CC-BY fitness dataset (such as Open-Exercise-Database or wger).

## 2. Default Seed Routines (`src/database/seedData.ts`)

- **Description**: Seed workout routines created on first launch (Push, Pull, Legs, Upper Body, Lower Body).
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
