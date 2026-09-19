# CI Exercise Visual Test Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exercise visual boundary test deterministic under the Node 24 GitHub Actions runner without changing production behavior.

**Architecture:** Keep the fix test-local. The boundary test will mock the native React Native and SVG modules before importing the boundary, alongside its existing Lucide mock, so the test never parses native Flow source in Node.

**Tech Stack:** Node test runner module mocks, TypeScript via `tsx`, React Native, `react-native-svg`.

**Spec:** GitHub Actions CI failure in PR #15, `tests/unit/exercise-visual.test.ts:41-59`, run `35442629532`.

## Global Constraints

- Do not modify production code or runtime behavior.
- Keep the existing assertions for the dumbbell fallback and requested accessibility/size props.
- Mock native modules before importing `src/components/ExerciseVisualErrorBoundary`.
- The fix must pass the Node 24 CI-equivalent unit command: `npm test`.
- Use only the existing test dependencies; do not add packages.

## Review Focus

- The boundary import must not resolve `react-native/index.js` during the first test.
- The existing Lucide fallback identity assertion must remain valid.
- The second visual test must retain its own React, React Native, SVG, and boundary mocks.
- No production files should be changed for a Node-only test isolation problem.
- The complete unit suite must remain at 410 passing tests.

---

### Task 1: Isolate native modules in the visual-boundary test

**Files:**
- Modify: `tests/unit/exercise-visual.test.ts` in `loadBoundary`.

**Interfaces:**
- Consumes: the existing `Image`, `View`, and `SvgExports` test doubles.
- Produces: a boundary import that is safe to evaluate under Node 24.

- [ ] **Step 1: Add native module mocks before the boundary import**

Update `loadBoundary` so it registers these mocks before importing the boundary:

```ts
t.mock.module('react-native', {
  exports: { Image, View, StyleSheet: { create: (styles: unknown) => styles } },
});
t.mock.module('react-native-svg', { exports: SvgExports });
t.mock.module('lucide-react-native', { exports: { Dumbbell } });
return import('../../src/components/ExerciseVisualErrorBoundary');
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --experimental-test-module-mocks --import tsx --test tests/unit/exercise-visual.test.ts
```

Expected: both visual runtime guard tests pass.

- [ ] **Step 3: Run the full unit suite**

Run:

```bash
npm test
```

Expected: 410 tests pass and 0 fail under Node 24.

- [ ] **Step 4: Commit the focused fix**

```bash
git add tests/unit/exercise-visual.test.ts
git commit -m "test: isolate native visual modules in CI"
```
