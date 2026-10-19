# Platform dispatch

Lifts targets Android, iOS, and web from one React Native codebase. This page is
the single reference for how platform-specific code is selected (ARCH-08).

## Rules

1. **Module selection uses Metro platform extensions.** Name the platform files
   `name.web.ts`, `name.native.ts`, `name.android.ts`, or `name.ios.ts`, and let
   Metro resolve them. Base files (`name.ts`) exist only as the Node/test-entry
   fallback and must not choose a variant at runtime.
2. **`Platform.OS` is reserved for behavior inside one module** (haptics, native
   driver, keyboard behavior, sharing APIs, alerts). It must not be used to pick
   between two module implementations.
3. **DOM capability checks are allowed only in `*.web.ts` modules** (plus the one
   documented exception in `src/utils/export.ts`, where the browser download path
   is a capability check on a module shared by every platform). ESLint enforces
   this with `no-restricted-syntax` on `typeof document`.
4. **Environment detection can stay when it is behavior, not selection.** For
   example `restNotifications.isExpoGoAndroid()` probes the runtime to decide
   whether local notifications are available; that is not module dispatch.

## Matrix

| Family | Base (`*.ts`, Node/tests) | Android | iOS | Web |
| --- | --- | --- | --- | --- |
| Database | `db.ts` re-exports `contract` + `db.native` | `db.native.ts` | `db.native.ts` | `db.web.ts` |
| Backup save | `saveBackup.ts` re-exports `saveBackup.web` + common | `saveBackup.native.ts` | `saveBackup.native.ts` | `saveBackup.web.ts` |
| Backup pick | `pickBackup.ts` re-exports `pickBackup.web` | `pickBackup.native.ts` | `pickBackup.native.ts` | `pickBackup.web.ts` |
| CSV pick | `pickCsv.ts` re-exports `pickCsv.web` | `pickCsv.native.ts` | `pickCsv.native.ts` | `pickCsv.web.ts` |
| Health export | `health/index.ts` (native provider) | `health/index.ts` | `health/index.ts` | `health/index.web.ts` |
| Rest notifications | `restNotifications.ts` (no-op + detection) | `restNotifications.android.ts` (rest-alarm module) | `restNotifications.ios.ts` (expo-notifications) | `restNotifications.web.ts` |
| Exact alarms | `exactAlarms.ts` (unsupported no-op) | `exactAlarms.android.ts` | `exactAlarms.ts` | `exactAlarms.ts` |

Notes:

- Metro prefers the most specific extension: `.android.ts`/`.ios.ts` beat
  `.native.ts`, which beats the base `.ts`. Web uses `.web.ts`.
- Base files run under Node tests, so they must stay import-safe (no native
  module loads at module scope and no DOM assumptions).
- `health/index.ts` is deliberately both the native implementation and the Node
  fallback: its provider/store imports are lazy loads, not platform selection.

## Adding a platform-specific module

1. Create the `*.native.ts`/`*.android.ts`/`*.ios.ts`/`*.web.ts` variants.
2. Add a base `*.ts` that re-exports a Node-safe variant, with a header comment
   pointing here.
3. Keep the exported entry points identical across variants.
4. `tests/unit/platform-dispatch.test.ts` asserts entry-point parity and fails if
   a base file starts doing runtime selection.
