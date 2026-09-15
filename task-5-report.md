# Task 5 Report

Implemented web exercise catalog synchronization with IndexedDB version 4.

## Changes

- Upgraded `createWebStore` from IndexedDB version 3 to version 4 while preserving all existing object stores.
- Added lease-owner-only, ID-based synchronization of bundled exercises.
- Missing bundled exercises are inserted; existing built-ins are refreshed from catalog version 2; custom rows, including custom rows using bundled IDs, are preserved.
- Stored `exercise_catalog_version` in metadata and invalidated the exercise cache after synchronization.
- Prevented read-only tabs from synchronizing catalog records or metadata.
- Exposed the existing optional instruction URL fields through the web custom-exercise update wrapper.
- Added focused v3-fixture integration coverage for upgrade behavior, store preservation, custom-row protection, missing seeds, metadata, version 4, and read-only behavior.

## Verification

- `npx tsx --test tests/integration/web-store.test.ts` — 26 passed.
- `npm test` — 375 passed.
- `npm run test:integration` — 131 passed.
- `npx tsc --noEmit` — passed.
