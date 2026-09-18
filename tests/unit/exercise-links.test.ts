import { before, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Exercise } from '../../src/types';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';

let openURLImplementation: (url: string) => Promise<void> = async () => {};
let openedUrl: string | undefined;
let getExerciseInstructionLink: typeof import('../../src/utils/exercise-links').getExerciseInstructionLink;
let openExerciseInstructionLink: typeof import('../../src/utils/exercise-links').openExerciseInstructionLink;

const exercise = (overrides: Partial<Exercise> = {}): Exercise => ({
  id: 'test-exercise',
  name: 'Test Exercise',
  category: 'strength',
  equipment: 'body only',
  primaryMuscles: ['chest'],
  ...overrides,
});

before(async (t) => {
  if (typeof t.mock.module === 'function') {
    mockLinking(t);
  }
  ({ getExerciseInstructionLink, openExerciseInstructionLink } = await import('../../src/utils/exercise-links'));
});

function mockLinking(t: { mock: { module: (specifier: string, options: { exports: object }) => void } }): void {
  t.mock.module('react-native', {
    exports: {
      Linking: {
        openURL: (url: string) => {
          openedUrl = url;
          return openURLImplementation(url);
        },
      },
    },
  });
}

describe('exercise instruction links', () => {
  it('prefers a valid curated website link', () => {
    assert.deepEqual(getExerciseInstructionLink(exercise({
      instructionUrl: 'https://example.com/bench',
      instructionUrlType: 'website',
      isCustom: true,
    })), {
      url: 'https://example.com/bench',
      type: 'website',
      label: 'Open exercise guide',
      isFallback: false,
    });
  });

  it('uses the curated YouTube label for a valid direct YouTube link', () => {
    assert.deepEqual(getExerciseInstructionLink(exercise({
      instructionUrl: 'https://www.youtube.com/watch?v=bench',
      instructionUrlType: 'youtube',
    })), {
      url: 'https://www.youtube.com/watch?v=bench',
      type: 'youtube',
      label: 'Watch form video',
      isFallback: false,
    });
  });

  it('falls back when the curated URL is missing, invalid, or mismatched', () => {
    for (const candidate of [
      exercise(),
      exercise({ instructionUrl: 'not a URL', instructionUrlType: 'website' }),
      exercise({ instructionUrl: 'https://example.com/bench', instructionUrlType: 'youtube' }),
    ]) {
      const link = getExerciseInstructionLink(candidate);
      assert.equal(link.type, 'youtube');
      assert.equal(link.label, 'Find form videos on YouTube');
      assert.equal(link.isFallback, true);
    }
  });

  it('uses the verified MuscleWiki guide for a mapped bundled exercise with a missing link', () => {
    const bundled = DEFAULT_EXERCISES.find(exercise => exercise.id === 'Barbell_Bench_Press_-_Medium_Grip')!;
    const link = getExerciseInstructionLink({ ...bundled, instructionUrl: undefined, instructionUrlType: undefined });
    assert.equal(link.url, 'https://musclewiki.com/exercise/barbell-bench-press');
    assert.equal(link.type, 'website');
    assert.equal(link.label, 'Open exercise guide');
    assert.equal(link.isFallback, true);
  });

  it('uses the verified MuscleWiki guide for a mapped bundled exercise with an invalid link', () => {
    const bundled = DEFAULT_EXERCISES.find(exercise => exercise.id === 'Barbell_Bench_Press_-_Medium_Grip')!;
    const link = getExerciseInstructionLink({ ...bundled, instructionUrl: 'not a URL', instructionUrlType: 'website' });
    assert.equal(link.url, 'https://musclewiki.com/exercise/barbell-bench-press');
    assert.equal(link.label, 'Open exercise guide');
    assert.equal(link.isFallback, true);
  });

  it('uses a deterministic YouTube fallback for an unmapped bundled exercise', () => {
    const bundled = DEFAULT_EXERCISES.find(exercise => exercise.instructionUrl === undefined)!;
    const link = getExerciseInstructionLink({ ...bundled, instructionUrl: undefined, instructionUrlType: undefined });
    assert.equal(link.type, 'youtube');
    assert.match(link.url, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
    assert.equal(link.label, 'Find form videos on YouTube');
  });

  it('rejects GitHub website links and falls back to YouTube', () => {
    const link = getExerciseInstructionLink({
      ...exercise(),
      instructionUrl: 'https://github.com/example/guide',
      instructionUrlType: 'website',
    });
    assert.equal(link.type, 'youtube');
    assert.doesNotMatch(link.url, /github\.com/i);
  });

  it('rejects GitHub subdomains for YouTube-typed links', () => {
    const link = getExerciseInstructionLink({
      ...exercise(),
      instructionUrl: 'https://docs.github.com/example/guide',
      instructionUrlType: 'youtube',
    });
    assert.equal(link.type, 'youtube');
    assert.equal(link.isFallback, true);
    assert.doesNotMatch(link.url, /github\.com/i);
  });

  it('does not use a verified guide for a custom exercise with a colliding ID', () => {
    const bundled = DEFAULT_EXERCISES[0];
    const link = getExerciseInstructionLink({
      ...bundled,
      isCustom: true,
      instructionUrl: undefined,
      instructionUrlType: undefined,
    });

    assert.equal(link.type, 'youtube');
    assert.equal(link.isFallback, true);
    assert.equal(link.url, `https://www.youtube.com/results?search_query=${encodeURIComponent(`${bundled.name} exercise form`)}`);
  });

  it('encodes punctuation, spaces, and non-ASCII exercise names deterministically', () => {
    const name = 'Développé, assis & mobilité';
    const link = getExerciseInstructionLink(exercise({ name }));

    assert.equal(link.url, `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form`)}`);
    assert.equal(decodeURIComponent(link.url), `https://www.youtube.com/results?search_query=${name} exercise form`);
  });

  it('delegates opening to the platform-safe Linking API', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }
    openedUrl = undefined;
    openURLImplementation = async () => {};
    const link = getExerciseInstructionLink(exercise({
      instructionUrl: 'https://example.com/bench',
      instructionUrlType: 'website',
    }));

    await openExerciseInstructionLink(link);

    assert.equal(openedUrl, link.url);
  });

  it('invokes Linking.openURL during the original call stack', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }
    const link = getExerciseInstructionLink(exercise({
      instructionUrl: 'https://example.com/bench',
      instructionUrlType: 'website',
    }));
    let afterCall = false;
    openURLImplementation = async () => {
      assert.equal(afterCall, false);
    };

    const opening = openExerciseInstructionLink(link);
    afterCall = true;
    await opening;
  });

  it('propagates an open failure to the caller', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }
    const expected = new Error('Unable to open exercise guide');
    openURLImplementation = async () => {
      throw expected;
    };

    await assert.rejects(
      () => openExerciseInstructionLink(getExerciseInstructionLink(exercise())),
      (error) => error === expected,
    );
  });
});
