import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { smartSearchExercises } from '../../src/utils/search';
import type { Exercise } from '../../src/types';

const catalog: Exercise[] = [
  {
    id: 'a',
    name: 'Barbell Bench Press - Medium Grip',
    category: 'chest',
    equipment: 'barbell',
    primaryMuscles: ['pectorals'],
  },
  {
    id: 'b',
    name: 'Barbell Full Squat',
    category: 'legs',
    equipment: 'barbell',
    primaryMuscles: ['quadriceps'],
  },
  {
    id: 'c',
    name: 'Zercher Squat',
    category: 'legs',
    equipment: 'barbell',
    primaryMuscles: ['quadriceps'],
  },
  {
    id: 'd',
    name: 'My Bench Variation',
    category: 'chest',
    equipment: 'barbell',
    primaryMuscles: ['pectorals'],
    isCustom: true,
  },
];

const ids = (list: Exercise[]): string[] => list.map(e => e.id);

describe('smartSearchExercises', () => {
  it('keeps staple ranking and alias expansion intact', () => {
    assert.deepEqual(ids(smartSearchExercises(catalog, 'bench')), ['a', 'd']);
    assert.deepEqual(ids(smartSearchExercises(catalog, 'squat')), ['b', 'c']);
  });

  it('returns the staple-first list for empty queries', () => {
    assert.deepEqual(ids(smartSearchExercises(catalog, '')), ['a', 'b', 'd', 'c']);
  });

  it('applies muscle and equipment filters', () => {
    assert.deepEqual(ids(smartSearchExercises(catalog, '', 'quadriceps')), ['b', 'c']);
    assert.deepEqual(ids(smartSearchExercises(catalog, 'squat', 'All', 'machine')), []);
  });

  it('normalizes each catalog record once per catalog version', () => {
    const synthetic: Exercise[] = Array.from({ length: 300 }, (_, i) => ({
      id: `ex-${i}`,
      name: i % 2 === 0 ? `Exercise ${i} Barbell Press` : `Exercise ${i} Machine Row`,
      category: 'strength',
      equipment: i % 3 === 0 ? 'barbell' : 'machine',
      primaryMuscles: ['pectorals'],
    }));

    const original = String.prototype.toLowerCase;
    let calls = 0;
    String.prototype.toLowerCase = function patched(this: string) {
      calls += 1;
      return original.call(this);
    } as typeof String.prototype.toLowerCase;

    try {
      smartSearchExercises(synthetic, 'press');
      const firstCalls = calls;
      calls = 0;
      const second = smartSearchExercises(synthetic, 'press');
      const secondCalls = calls;

      assert.ok(firstCalls > 300, `first query normalizes the catalog (${firstCalls} calls)`);
      assert.ok(
        secondCalls <= 5,
        `second query reuses the index instead of re-normalizing (${secondCalls} calls)`,
      );

      calls = 0;
      const freshForEmpty: Exercise[] = Array.from({ length: 300 }, (_, i) => ({
        id: `fresh-${i}`,
        name: i % 2 === 0 ? `Exercise ${i} Barbell Press` : `Exercise ${i} Machine Row`,
        category: 'strength',
        equipment: i % 3 === 0 ? 'barbell' : 'machine',
        primaryMuscles: ['pectorals'],
      }));
      smartSearchExercises(freshForEmpty, '');
      const firstEmptyCalls = calls;
      calls = 0;
      smartSearchExercises(freshForEmpty, '');
      const secondEmptyCalls = calls;
      assert.ok(
        firstEmptyCalls >= 300,
        `first empty query indexes the catalog (${firstEmptyCalls} calls)`,
      );
      assert.ok(
        secondEmptyCalls <= 1,
        `second empty query serves the cached list (${secondEmptyCalls} calls)`,
      );

      assert.equal(second.length, 100, 'results stay capped at 100');
    } finally {
      String.prototype.toLowerCase = original;
    }
  });
});
