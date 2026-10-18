# Security Policy

## Supported versions

Only the latest published release receives security fixes. Install updates from [GitHub Releases](https://github.com/Benflex1/lifts/releases) or F-Droid.

## Reporting a vulnerability

Use GitHub's private reporting flow: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a vulnerability.

Include what you found, the affected platform and version, reproduction steps, and the impact you expect. If the report involves a backup file, export a minimal synthetic example instead of real training data.

## Scope

Lifts is a local-first app with no accounts, no server backend, and no telemetry. The highest-impact areas are:

- Local storage integrity (SQLite migrations, IndexedDB upgrades, backup export/restore, collision handling).
- The web single-writer lease that prevents two browser tabs from writing at once.
- The optional, opt-in health export boundary (Apple Health / Health Connect): only a session summary is written, and no health data is read.

## Response expectations

This is a volunteer-maintained project, so responses are best-effort. Confirmed issues are fixed on `main` and called out in `CHANGELOG.md`.

## Accepted build-tooling advisories

Advisories in dev/build tooling that never ships in the app are tracked with triage notes in `docs/release-checklist.md` section 2 and enforced by `scripts/audit-policy.mjs`. Those entries are not vulnerabilities in the shipped app; report anything that does reach the app through the private flow above.
