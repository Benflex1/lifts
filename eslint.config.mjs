// Flat ESLint config. Runs over app source, tests, and build scripts; generated
// output (Expo exports, native projects, coverage) is ignored.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist*/**',
      'android/**',
      'ios/**',
      '.expo/**',
      'coverage/**',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // ARCH-11 tracks the remaining `any` clusters at storage boundaries.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // A11Y-01/A11Y-02: labelled surfaces must use the AppTouchable primitive.
    // Raw touchables (with ad-hoc or missing labels) are rejected here.
    files: [
      'src/screens/activeWorkout/**/*.{ts,tsx}',
      'src/screens/ActiveWorkoutScreen.tsx',
      'src/components/ActiveExerciseCard.tsx',
      'src/components/ActiveSetRow.tsx',
      'src/components/WarmupModal.tsx',
      'src/components/WorkoutDurationModal.tsx',
      'src/components/PlateCalculatorModal.tsx',
      'src/components/ExercisePickerModal.tsx',
      'src/components/DraftRecoveryModal.tsx',
      'src/components/DraftResumeBanner.tsx',
      'src/components/RestTimerOverlay.tsx',
      'src/components/ActiveWorkoutMiniBar.tsx',
      'src/components/ReadOnlyBanner.tsx',
      'src/components/RestTimeWheelModal.tsx',
      'src/components/PRCelebrationToast.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['TouchableOpacity', 'TouchableHighlight', 'Pressable'],
              message:
                'Use AppTouchable from src/components/ui (it requires an accessibility label).',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests exercise host-component stubs and legacy fixtures; loose typing is
    // expected there and is checked by tsconfig.test.json instead.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['scripts/**/*.{cjs,mjs}', 'plugins/**/*.js', '*.config.mjs', 'modules/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
