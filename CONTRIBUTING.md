# Contributing to Lifts

Thank you for contributing to Lifts! Lifts is a free, local-first, open-source gym workout tracker built with React Native and Expo.

---

## 1. Prerequisites & Toolchain

- **Node.js**: v18.0.0 or higher (LTS recommended)
- **npm**: v9.0.0 or higher
- **Expo CLI**: bundled via local dependencies
- **Git**: modern git client

---

## 2. Getting Started

1. Fork the repository and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/lifts.git
   cd lifts
   ```

2. Perform a clean dependency installation:
   ```bash
   npm ci
   ```

3. Start the Expo development server:
   ```bash
   npm start
   ```

4. For physical device testing over LAN or tunnel:
   ```bash
   npm run tunnel
   ```

---

## 3. Testing & Verification Requirements

Every change must pass our verification suite before submitting a pull request:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Fast unit tests
npm test

# 3. Cross-platform integration tests (Native SQLite + Web IndexedDB)
npm run test:integration

# 4. Web production export smoke test
npx expo export --platform web --output-dir dist-audit-web
```

---

## 4. Architecture & Design Rules

When contributing code, adhere strictly to these core principles:

1. **Strict Zero Emojis Policy**:
   - Do not use emojis in source code, commit messages, comments, PR descriptions, or documentation.

2. **Durable, Local-First Persistence**:
   - All changes must be durable before UI feedback confirms an action.
   - Native storage uses SQLite (`src/database/nativeStore.ts`); web storage uses IndexedDB (`src/database/webStore.ts`).
   - Both stores must adhere to the contract defined in `src/database/contract.ts`.

3. **Storage Migrations & Backward Compatibility**:
   - Never write non-versioned schema changes.
   - All SQLite migrations must use numbered sequential steps with transactional rollback safety (`src/database/migrations.ts`).
   - User database snapshots must never lose existing workouts, routines, or settings on upgrade.

4. **Data Integrity**:
   - Canonical weights are stored in kilograms (`kg`).
   - `0 kg` is a valid, distinct weight (e.g. bodyweight exercises). Never coerce 0 to null or default weights.
   - PRs and previous-set suggestions must only be derived from completed workout sets (`is_completed = 1`). Drafts must never affect statistics.

5. **Cross-Platform Accessibility**:
   - Ensure all touch targets are at least 44x44 pt.
   - Provide appropriate `accessibilityRole` and `accessibilityLabel` attributes on all touchable elements.

---

## 5. Submitting Pull Requests

1. Create a focused feature branch:
   ```bash
   git checkout -b feature/my-improvement
   ```
2. Commit your changes using conventional, atomic commit messages:
   ```bash
   git commit -m "feat: descriptive message in lowercase without emojis"
   ```
3. Run the full verification suite (`npx tsc --noEmit && npm test && npm run test:integration`).
4. Push your branch to GitHub and open a Pull Request against `main`.
5. Clearly describe the motivation, test evidence, and verified platforms in your PR description.
