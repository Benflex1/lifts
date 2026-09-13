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
- Android Health Connect custom-build device acceptance remains unverified.
- The release rows accurately defer both device checks until user-performed custom-build testing; no Expo Go health validation is claimed.
