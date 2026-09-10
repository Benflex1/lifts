# Task 1 Report: Add canonical gym types and scope policy

## Implementation summary

Added the canonical gym domain models and expanded the `Store` contract with gym, exercise-scope, previous-set, and dual-statistics interfaces. Added pure scope-policy and gym-profile validation modules, including the exact machine/cable default isolation policy and the canonical six-color palette. Added temporary `gym-default` compatibility to new workouts and legacy migration-created drafts, and updated the required fixtures and session Store stub.

No Tasks 2–11 behavior was implemented. Routines remain unchanged and no draft gym column was added.

## Files changed

- `src/types/index.ts`
- `src/database/contract.ts`
- `src/workout/gym-scope.ts`
- `src/workout/gym-profile.ts`
- `src/context/WorkoutContext.tsx`
- `src/database/migrations.ts`
- `tests/unit/gym-scope.test.ts`
- `tests/unit/gym-profile.test.ts`
- `tests/unit/analytics.test.ts`
- `tests/unit/session.test.ts`
- `tests/unit/workout-edit.test.ts`
- `tests/integration/backup-roundtrip.test.ts`
- `tests/integration/completion-lifecycle.test.ts`
- `tests/integration/draft-lifecycle.test.ts`
- `tests/integration/history-stats.test.ts`
- `tests/integration/native-store.test.ts`
- `tests/integration/web-store.test.ts`

## Tests and outputs

- `npx tsx --test tests/unit/gym-scope.test.ts`: RED as expected before implementation; module resolution failed because `src/workout/gym-scope.ts` did not exist.
- `npx tsx --test tests/unit/gym-scope.test.ts tests/unit/gym-profile.test.ts`: GREEN, 8 passing, 0 failing.
- `npm test`: GREEN, 109 passing, 0 failing.
- `npm run test:integration`: GREEN, 46 passing, 0 failing.

## TDD RED and GREEN evidence

The policy tests were written before the production policy modules. The required focused RED run failed with `Cannot find module '../../src/workout/gym-scope'`, confirming the new behavior was not already present. After the minimal types, contract, scope policy, profile validation, and compatibility fixture changes were added, the focused policy run passed all 8 tests. The complete unit and integration suites then passed with 109 and 46 tests respectively.

## Self-review findings

- Confirmed only `machine` and normalized `cable` default to `gym_specific`; other equipment defaults to `global`.
- Confirmed explicit overrides take precedence and linked scopes return copied gym ID sets.
- Confirmed validation rejects empty exercise IDs, linked IDs on non-linked scopes, fewer than two linked IDs, duplicate IDs, and unknown gym IDs.
- Confirmed gym names are trimmed and counted by Unicode code points, colors are restricted to the exact palette, and deletion requires a valid distinct replacement with at least two gyms.
- Confirmed `Workout.gymId` and `WorkoutHistorySummary.gymId` are required, while suggestion source metadata remains optional.
- Confirmed every listed workout/draft fixture uses `gym-default`; required snapshot literals and the session Store stub use the canonical default gym data.
- Confirmed no draft schema column, dynamic gym selection, persistence implementation, migration 5, or IndexedDB version 2 work was added.
- `git diff --check` passed.

## Concerns

Full repository typecheck is intentionally deferred: native and web Store implementations do not yet implement the newly required contract methods and will be completed in Tasks 3–4, as specified by the brief.
