# Task 9 Report: Active Workout Gym Picker and Foreign Ghost Labels

## Scope completed

- Added `formatPreviousMetric` in `src/workout/gym-display.ts`.
- Added focused formatter coverage for local, foreign, and global suggestions in `tests/unit/gym-display.test.ts`.
- Added the active-workout gym chip using the active gym color/name and a dropdown marker.
- Wired the chip to `GymPickerModal`, `gyms`, `activeGym`, and `setActiveGym` from `WorkoutContext`.
- Awaited gym selection and notified with the existing dialog convention when switching fails; errors are rethrown so the picker remains open for recovery.
- Hid the chip and picker when `gymTrackingEnabled` is false. Stored workout gym IDs are not changed by the visibility toggle.
- Routed previous-set text through `formatPreviousMetric`, labeling only suggestions with a source gym name while preserving the existing weight-input placeholder path. Source labels are also hidden when gym tracking is disabled.
- Did not add history filters, reassignment, scope controls, or other Task 10 UI.

## TDD evidence

1. Added the formatter test before the formatter implementation.
2. Ran `npx tsx --test tests/unit/gym-display.test.ts`; it failed with the expected missing-module error for `src/workout/gym-display`.
3. Added the minimal formatter implementation.
4. Reran the focused test; all 3 tests passed.

## Verification

- `npx tsx --test tests/unit/gym-display.test.ts` — passed, 3/3.
- `npx tsx --test tests/unit/gym-display.test.ts tests/unit/gym-session.test.ts` — passed, 12/12.
- `npx tsc --noEmit` — passed.
- `npx expo export --platform web --output-dir /tmp/lifts-web-export-multi-gym` — passed; web bundle exported successfully.
- `git diff --check` — passed.

## Manual validation

Native device validation was not available in this environment. The following live-device checks remain outstanding: switching gyms during a workout, confirming untouched ghost values refresh while entered/completed values remain unchanged, confirming rest timer and duration remain unchanged, and minimizing/restoring to verify gym persistence.

## Concerns

- The native/manual interaction flow is covered by existing `WorkoutContext`/`gym-session` behavior and static/type/build checks, but still needs Android/iOS device confirmation.
- The shell environment emits pre-existing `NPM_CONFIG_PREFIX` and missing `/tmp/devspace-semgrep-*/uv/env` profile warnings; they did not affect command exit status or verification results.
