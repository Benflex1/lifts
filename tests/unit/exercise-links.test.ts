import { before, describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { Exercise } from '../../src/types';
import { DEFAULT_EXERCISES } from '../../src/database/seedData';
import { getFreeExerciseDbGuideUrl } from '../../src/database/exercise-source';

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

before(async () => {
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

  it('uses the pinned source guide for a bundled exercise with a missing link', () => {
    const bundled = DEFAULT_EXERCISES[0];
    const link = getExerciseInstructionLink({ ...bundled, instructionUrl: undefined, instructionUrlType: undefined });
    assert.deepEqual(link, {
      url: getFreeExerciseDbGuideUrl(bundled.id),
      type: 'website',
      label: 'Open exercise guide',
      isFallback: true,
    });
  });

  it('uses the pinned source guide for a bundled exercise with an invalid link', () => {
    const bundled = DEFAULT_EXERCISES[0];
    const link = getExerciseInstructionLink({ ...bundled, instructionUrl: 'not a URL', instructionUrlType: 'website' });
    assert.equal(link.url, getFreeExerciseDbGuideUrl(bundled.id));
    assert.equal(link.label, 'Open exercise guide');
    assert.equal(link.isFallback, true);
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
    mockLinking(t);
    openedUrl = undefined;
    openURLImplementation = async () => {};
    const link = getExerciseInstructionLink(exercise({
      instructionUrl: 'https://example.com/bench',
      instructionUrlType: 'website',
    }));

    await openExerciseInstructionLink(link);

    assert.equal(openedUrl, link.url);
  });

  it('propagates an open failure to the caller', async (t) => {
    if (typeof t.mock.module !== 'function') {
      t.skip('Node module mocks are required to isolate React Native in Node');
      return;
    }
    mockLinking(t);
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
