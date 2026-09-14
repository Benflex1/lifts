# Third-Party Notices and Licenses

Lifts incorporates open-source software packages and libraries. This document lists the third-party components, their copyrights, and their respective licenses.

---

## 1. Expo & React Native Ecosystem

### Expo SDK (`expo`, `expo-sqlite`, `expo-haptics`, `expo-keep-awake`, `expo-crypto`, `expo-sharing`, `expo-file-system`, `expo-document-picker`, `expo-status-bar`)
- **Copyright**: 2015-present 650 Industries, Inc.
- **License**: MIT License
- **URL**: https://github.com/expo/expo

### HealthKit (`@kingstinct/react-native-healthkit` 15.1.0)
- **License**: MIT License ([authoritative license](https://github.com/kingstinct/react-native-healthkit/blob/main/LICENSE))
- **URL**: https://github.com/kingstinct/react-native-healthkit

### Nitro Modules (`react-native-nitro-modules` 0.37.1)
- **License**: MIT License ([authoritative license](https://github.com/mrousavy/nitro/blob/main/LICENSE))
- **URL**: https://github.com/mrousavy/nitro

### Health Connect (`react-native-health-connect` 4.1.3)
- **License**: MIT License ([authoritative license](https://github.com/matinzd/react-native-health-connect/blob/main/LICENSE))
- **URL**: https://github.com/matinzd/react-native-health-connect

### Expo Build Properties (`expo-build-properties` 57.0.17)
- **License**: MIT License ([authoritative license](https://github.com/expo/expo/blob/main/LICENSE))
- **URL**: https://github.com/expo/expo/tree/main/packages/expo-build-properties

### React & React Native (`react`, `react-native`)
- **Copyright**: Meta Platforms, Inc. and affiliates
- **License**: MIT License
- **URL**: https://github.com/facebook/react-native

---

## 2. UI & Iconography

### Lucide React Native (`lucide-react-native`)
- **Copyright**: 2022 Lucide Contributors
- **License**: ISC License
- **URL**: https://github.com/lucide-icons/lucide
- **License Text**:
  Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE.

---

## 3. Database & Storage Libraries

### sql.js (`sql.js`)
- **Copyright**: 2021 Alon Zakai and sql.js contributors
- **License**: MIT License
- **URL**: https://github.com/sql-js/sql.js

### fake-indexeddb (`fake-indexeddb` - test environment)
- **Copyright**: 2015-2023 Aaron Turner
- **License**: Apache License 2.0
- **URL**: https://github.com/dumbmatter/fake-indexeddb

---

## 4. Development & Build Tools

### TypeScript (`typescript`)
- **Copyright**: Microsoft Corporation
- **License**: Apache License 2.0
- **URL**: https://github.com/microsoft/TypeScript

### TSX (`tsx`)
- **Copyright**: Privatenumber (Hiroki Osame)
- **License**: MIT License
- **URL**: https://github.com/privatenumber/tsx

---

## 5. Bundled Data

### Free Exercise DB exercise data
- **Upstream**: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f), revision `a859101d633a01c4a1a920d6a8ce41dabba0705f`
- **Credited original dataset**: [`wrkout/exercises.json`](https://github.com/wrkout/exercises.json/tree/5994bea047eee4d39a2c0872be3dd8fdd258ba31)
- **License**: Unlicense / public-domain dedication
- **Lifts transformation**: Lifts retains the 876 upstream records, IDs, order, names, categories, muscle fields, and instructions. It normalizes 77 upstream `null` equipment values to `body only`. Lifts does not bundle upstream images or videos.
- **License text**: [`licenses/UNLICENSE`](licenses/UNLICENSE)
- **Detailed provenance and verification hashes**: [`docs/data-provenance.md`](docs/data-provenance.md)

### Workout Guide exercise illustration
- **Asset**: `assets/exercises/workout-guide-plank-frame-1.svg`
- **Source**: [`bryllim/workout-guide`](https://github.com/bryllim/workout-guide), revision `aac599224bb9780305239607ef98540b7e0ce389`, `packages/workout-guide/assets/plank/frame-1.svg`
- **Mapping**: Local exercise ID `Plank` → Workout Guide manifest ID `exercise-plank` / slug `plank`; exact exercise name `Plank` verified before vendoring.
- **Creator**: Bryl Lim ([bryllim.com](https://bryllim.com)), as credited by the pinned Workout Guide metadata
- **License**: [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). The verbatim legal code is bundled at [`licenses/CC-BY-SA-4.0.txt`](licenses/CC-BY-SA-4.0.txt); attribution, source revision, and asset hash are recorded in [`assets/exercises/attribution.json`](assets/exercises/attribution.json).
- **Asset SHA-256**: `0f65a842d151f80918e4ee45d1a9f659dd5a82e2d9857c9ad6ae06832a872e94`
