import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Exercise } from '../../src/types';
import {
  defaultScopeForEquipment,
  resolveExerciseScope,
  getAllowedGymIds,
  validateExerciseGymScope,
} from '../../src/workout/gym-scope';

const exercise = (equipment: string): Exercise => ({
  id: `exercise-${equipment}`,
  name: equipment,
  category: 'strength',
  equipment,
  primaryMuscles: ['back'],
});

describe('multi-gym scope policy', () => {
  it('isolates machine and cable equipment by default', () => {
    assert.equal(defaultScopeForEquipment('machine'), 'gym_specific');
    assert.equal(defaultScopeForEquipment(' Cable '), 'gym_specific');
    assert.equal(defaultScopeForEquipment('barbell'), 'global');
    assert.equal(defaultScopeForEquipment('e-z curl bar'), 'global');
  });

  it('lets an explicit override replace the equipment default', () => {
    assert.equal(
      resolveExerciseScope(exercise('machine'), { exerciseId: 'exercise-machine', scopeType: 'global' }),
      'global'
    );
  });

  it('returns all gyms for global exercises and the current/linked gyms otherwise', () => {
    assert.equal(getAllowedGymIds(exercise('barbell'), undefined, 'gym-a'), null);
    assert.deepEqual(
      getAllowedGymIds(
        exercise('machine'),
        { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a', 'gym-b'] },
        'gym-default'
      ),
      new Set(['gym-a', 'gym-b'])
    );
  });

  it('rejects linked scopes with missing, duplicate, or fewer-than-two gym IDs', () => {
    const known = new Set(['gym-a', 'gym-b']);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a'] },
      known
    ), /at least two/);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a', 'gym-a'] },
      known
    ), /duplicate/);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'linked_group', linkedGymIds: ['gym-a', 'gym-c'] },
      known
    ), /unknown gym/);
  });

  it('rejects linked IDs on non-linked scopes and empty exercise IDs', () => {
    const known = new Set(['gym-a', 'gym-b']);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: 'exercise-machine', scopeType: 'global', linkedGymIds: ['gym-a', 'gym-b'] },
      known
    ), /only valid/);
    assert.throws(() => validateExerciseGymScope(
      { exerciseId: '  ', scopeType: 'gym_specific' },
      known
    ), /empty/);
  });
});
