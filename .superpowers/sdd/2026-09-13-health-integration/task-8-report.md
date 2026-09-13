# Task 8 Report: Documentation and Release Acceptance

## Search baseline

Command run before editing:

```bash
rg -n "Expo Go|Health Connect|Apple Health|HealthKit|health_sync_enabled" README.md ROADMAP.md THIRD_PARTY_NOTICES.md docs/release-checklist.md
```

The baseline found the generic Expo Go development instructions at `README.md:80` and `README.md:104`, plus the Apple Health/Health Connect backlog entries at `ROADMAP.md:44` and `ROADMAP.md:99`. There were no baseline matches in `THIRD_PARTY_NOTICES.md` or `docs/release-checklist.md`.

## Changed files

- `README.md`: documented local-first web/non-health native development, custom native build requirements, opt-in export, exact export scope, and backup exclusion.
- `ROADMAP.md`: moved HealthKit/Health Connect from backlog to current implementation, while retaining pending device acceptance.
- `THIRD_PARTY_NOTICES.md`: added the installed HealthKit, Nitro Modules, Health Connect, and Expo Build Properties packages with metadata-derived MIT licenses and repository/license links.
- `docs/release-checklist.md`: added automated acceptance rows for migrations, backup exclusion, web no-op, completion isolation, and retry deduplication, plus deferred custom-build device rows.

## Verification

- Post-edit prescribed `rg` search: passed.
- `git diff --check`: passed.
- `npm test`: passed, 345 tests, 0 failures.
- `npm run test:integration`: passed, 123 tests, 0 failures.
- Commit hash: `ed422dade5997ed6f0c30ed571ada92df3f605ee`

## Concerns

- iOS HealthKit custom-build device acceptance remains unverified.
- Android Health Connect custom-build device acceptance was user-verified on the current branch's standalone Android APK: Health Connect and health sync were enabled, a workout was completed, and the workout export was confirmed to work. Device details were not recorded.
- iOS HealthKit custom-build device acceptance remains unverified; no iOS validation is claimed.
- No Expo Go health validation is claimed.

## Task 8 review fix

- Corrected the Android prerequisite to Build-Tools 36.0.0 and Platform SDK 36 to match the committed Expo compile/target SDK configuration.
- Clarified in the README and roadmap that the provider payload includes the workout title, strength-workout type, and session start/end timing and duration, while retaining the no-reads and no-set-level-export limits.
- Fix commit: `945d0bba85b6123ceb196e3854c190c81def69e3`

## Task 8 review fix follow-up

- Corrected the README and roadmap to state that workout title is included only in the Health Connect payload; HealthKit includes only the strength-workout type and session start/end timing and duration.
- Preserved the no-reads and no-set-level-export limits.
- Fix commit: `5380cf10562a214d5d11f2a9a3c184ce13d342fe`
