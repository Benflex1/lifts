import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Gym } from '../../src/types';
import {
  GYM_COLOR_PALETTE,
  DEFAULT_GYM_COLOR,
  validateGymName,
  validateGymColor,
  validateGymDeletion,
  validateWorkoutGymId,
  isGymUsedByActiveWorkout,
  resolveActiveGymAfterRefresh,
} from '../../src/workout/gym-profile';

const gyms: Gym[] = [
  { id: 'gym-default', name: 'Default Gym', isDefault: true, color: DEFAULT_GYM_COLOR, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'gym-other', name: 'Other Gym', isDefault: false, color: GYM_COLOR_PALETTE[1], createdAt: '2026-01-01T00:00:00.000Z' },
];

describe('gym profile validation', () => {
  it('accepts only an existing non-whitespace workout gym ID', () => {
    assert.equal(validateWorkoutGymId('gym-default', gyms), 'gym-default');
    assert.throws(() => validateWorkoutGymId('  ', gyms), /gym ID cannot be empty/i);
    assert.throws(() => validateWorkoutGymId(' gym-default ', gyms), /unknown gym/i);
    assert.throws(() => validateWorkoutGymId('missing', gyms), /unknown gym/i);
  });

  it('trims valid names and rejects empty or overly long names', () => {
    assert.equal(validateGymName('  Downtown Gym  '), 'Downtown Gym');
    assert.throws(() => validateGymName('   '), /empty/);
    assert.throws(() => validateGymName('😀'.repeat(81)), /80/);
  });

  it('accepts only the canonical gym color palette', () => {
    assert.equal(validateGymColor(DEFAULT_GYM_COLOR), DEFAULT_GYM_COLOR);
    assert.throws(() => validateGymColor('#000000'), /palette/);
  });

  it('requires a distinct replacement and at least two known gyms for deletion', () => {
    assert.doesNotThrow(() => validateGymDeletion('gym-default', 'gym-other', gyms));
    assert.throws(
      () => validateGymDeletion('gym-default', 'gym-other', gyms, 'gym-default'),
      /active workout/i,
    );
    assert.throws(() => validateGymDeletion('missing', 'gym-other', gyms), /unknown gym/);
    assert.throws(() => validateGymDeletion('gym-default', 'gym-default', gyms), /different/);
    assert.throws(() => validateGymDeletion('gym-default', 'gym-other', [gyms[0]]), /at least two/);
  });

  it('identifies the active workout gym and preserves its refreshed metadata', () => {
    assert.equal(isGymUsedByActiveWorkout('gym-default', 'gym-default'), true);
    assert.equal(isGymUsedByActiveWorkout('gym-default', null), false);

    const renamedActiveGym = { ...gyms[0], name: 'Renamed Default' };
    assert.equal(resolveActiveGymAfterRefresh([renamedActiveGym, gyms[1]], gyms[1], 'gym-default'), renamedActiveGym);
    assert.equal(resolveActiveGymAfterRefresh([gyms[0], gyms[1]], gyms[1], null), gyms[1]);
  });
});
