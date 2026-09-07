# Lifts audit remediation design

Date: 2026-09-07
Status: Proposed implementation design requested after the repository audit; implementation has not started.

## Objective and scope

Make existing workout logging, recovery, export, and platform promises dependable before expanding feature parity. The audit and this specification are the requirements for the accompanying implementation plan.

The earlier parity-pass specification explicitly excluded persistent web storage. Memory-only web storage was therefore an intentional preview limitation, not a deviation from that specification. This proposal expands web support to match the current README. It supersedes the older plan's instructions to keep an in-memory web adapter, rebase recovered workout timestamps, and export history summaries as backups.

## Global constraints

- Keep the app free, local-first, account-free, and without ads or tracking.
- Preserve existing native workout history, routines, custom exercises, settings, and unfinished drafts through migrations.
- Store canonical weights in kg; changing display units must not rewrite stored weights.
- Keep zero kg valid. Never invent a weight when completing a set.
- Preserve the original workout start timestamp across minimize, background, restart, and recovery.
- Finish and discard must be durable before the UI drops the active session.
- Storage failures must be visible and retryable; never silently fall back to temporary storage.
- Retain the existing Expo 57 / React Native 0.86 stack unless a verified compatibility issue requires a change.
- Add no backend, subscriptions, cloud accounts, or required paid build service.
- Do not claim native-device verification, legal provenance, or store availability without evidence.

## Product decisions

1. **One active workout.** Starting or repeating while an active or recoverable workout exists offers Resume or Cancel. Discard remains an explicit, separate action. A synchronous start/finish guard prevents double-tap races.
2. **Time.** Elapsed workout time includes time away from the app until Finish. Recovery retains the original timestamp and recomputes elapsed time. The app does not infer breaks or modify dates to hide long interruptions. Rest deadlines survive recovery; expired deadlines are cleared. Background notification delivery is not promised in this remediation.
3. **Logging.** Initialize set values once. A fixed target such as `5` initializes five reps; `6-8` initializes six and displays the target; `10, 8, 6` initializes corresponding set values, repeating the final target for extra sets. AMRAP retains its visible label and uses previous reps or an editable default of ten. A valid numeric routine target takes precedence over previous reps; previous weights remain suggestions. Zero is preserved; negative/non-finite weights and non-positive/non-integer completed reps are rejected.
4. **Persistence.** SQLite remains native storage. IndexedDB becomes web storage behind the existing platform module boundary. Both adapters implement the same behavioral contract. A write is successful only after its transaction commits. A second browser tab cannot silently become a competing writer.
5. **Drafts.** Move draft snapshots into a dedicated, versioned store so a late autosave cannot turn a completed workout back into a draft. Migrate every existing `in_progress=1` workout atomically; do not drop older recoverable drafts. Offer a selectable recovery list when multiple drafts exist. Serialize lifecycle writes and invalidate obsolete pending saves.
6. **Backups.** Schema v2 contains complete completed workouts, routines, custom and referenced exercise definitions, all recoverable drafts, and user settings. Export is a consistent snapshot. Restore merges atomically; identical records are skipped, conflicting existing IDs abort with an explanation, and nothing is silently overwritten. Block restore during an active session. Version 1 summaries cannot recreate sets: explain this and leave storage unchanged.
7. **Completion and confirmations.** A parent-owned completion summary survives logger unmount; dismissing it opens refreshed History. All destructive confirmations use accessible application UI that works on native and web. Persistence failures keep the dialog/session open for retry.
8. **Web promise.** Reload-safe local data is in scope. Browser-data clearing, private browsing, and storage eviction remain browser limitations. Offline cold launch/installable PWA support is not included; documentation must distinguish native offline operation from web persistence.
9. **Release.** Establish reproducible checks and a documented local Android debug APK build. Public store publishing, production signing identities, and account registration are separate release actions.

## Acceptance criteria

- Restarting either storage adapter retains all saved user records and settings.
- Initial seeding includes all 876 bundled exercises and uses exact exercise IDs; missing IDs abort seeding.
- A 0 kg set stays 0 kg after completion, recovery, export, and restore.
- A routine targeting five reps starts at five with no history and retains its target label with history.
- A 20-minute interrupted workout resumes with its original start time and the correct wall-clock duration.
- Start, Finish, Discard, autosave, and background-save races cannot lose, duplicate, or resurrect sessions.
- A failed save or migration never produces a success screen or an empty fallback database.
- Export from one database and restore into an empty database preserves full workout/set content and custom exercise relationships.
- kg/lb selection is reachable, persistent, and safe while a weight input is being edited.
- Web delete/discard confirmations work; cancellation changes nothing.
- Documentation accurately distinguishes implemented features, limitations, and planned parity work.

## Deferred product work

Supersets/giant sets, extra set tags, charts, video guidance, workout editing, body measurements, routine sharing, social/community features, third-party history imports, health integrations, and store publication require subsequent scoped plans. Missing parity is reported honestly rather than marked complete by this remediation.
