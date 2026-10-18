# PR review follow-up — 2026-10-19

This follow-up supersedes the completion claims in the initial remediation audit where noted below.

## Reliability and state

- Save-failure recovery downloads the current in-memory workout as JSON on web; it does not require Web Share or a working database. This emergency file is a workout record, not a full backup accepted by the backup importer. Native sharing remains available.
- Exercise-card overload callbacks keep stable identities while using current arguments and dependency-tracked actions. A controller-driven render regression covers the actual card wiring.
- Keep lazy module loading. Remove five-minute tab eviction: no device memory measurement demonstrated its value, and it discarded user state and could return a blank pane after minimizing the logger. Visited tabs now remain mounted for the app session.
- Rebuild the date-dependent week summary on activation even if storage did not change.
- Persist web data revisions separately from the writer lease and advance them in the data transaction, so shutdown, failed writes and rollbacks cannot create false cache hits.

## Product scope

- Keep the typed English/German message catalogs as internal scaffolding. The app currently starts in English, has no language selector or persisted language preference, and does not provide a localized end-to-end experience. Locale-aware number/date formatting and the remaining screens belong to the localization follow-up; scaffolding alone does not complete that product work. A language selector is deferred until the main flows can render consistently in the selected language.
- Keep the fixed four-tab navigation model. Loading bookmarks and browser back/forward must not create extra entries.
- Keep web installability only with a build-generated precache of the matching shell and exported assets. Offline reload is supported after service-worker installation finishes; a first visit must finish online. Updates wait until existing clients close so old and new release assets do not mix. Only Lifts shell caches may be removed.
- Screen/controller extraction and shared store policies remain useful. Controller size alone is not proof of a completed architecture cleanup; further decomposition should follow a concrete maintenance or testing need.

## Verification claims

- LCOV output is generated locally and uploaded by CI, not tracked in Git.
- Node coverage percentages describe executed modules, not every application source file. Passing thresholds do not establish app-shell coverage or device-level correctness.
- The Android journey runs on relevant pull requests into main/develop and relevant main/develop/phase pushes. Repository branch protection still decides whether its check is required for merging.
- Renderer, worker-lifecycle and storage regressions cover the reported failures. They do not substitute for physical-device performance profiling, VoiceOver/TalkBack testing, or store publishing verification.
