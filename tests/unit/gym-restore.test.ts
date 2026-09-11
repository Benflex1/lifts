import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildGymRestoreMapping, remapGymReferences } from '../../src/utils/gym-restore';
import { DataSnapshot } from '../../src/database/contract';

describe('gym restore mapping', () => {
  it('remaps colliding gym IDs across workouts, drafts, and linked scopes', () => {
    const sourceGyms = [
      {
        id: 'source-default', name: 'Source Default', color: '#3B82F6', isDefault: true,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'gym-a', name: 'Imported Gym', color: '#10B981', isDefault: false,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ];
    const destinationGyms = [
      {
        id: 'gym-default', name: 'Default Gym', color: '#3B82F6', isDefault: true,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'gym-a', name: 'Different Gym', color: '#F59E0B', isDefault: false,
        createdAt: '2026-09-10T00:00:00.000Z',
      },
    ];
    const snapshot = {
      workouts: [{ id: 'w1', name: 'Workout', gymId: 'gym-a' }],
      routines: [], exercises: [],
      drafts: [{ version: 1, workout: { id: 'd1', name: 'Draft', gymId: 'gym-a' }, savedAt: '2026-09-10T00:00:00.000Z', revision: 1, restTimer: null }],
      settings: {},
      gyms: sourceGyms,
      exerciseGymScopes: [{ exerciseId: 'ex1', scopeType: 'linked_group', linkedGymIds: ['source-default', 'gym-a'] }],
    } as unknown as DataSnapshot;

    const mapping = buildGymRestoreMapping(sourceGyms, destinationGyms);
    const remapped = remapGymReferences(snapshot, mapping.idMap);
    const importedId = mapping.idMap.get('gym-a')!;

    assert.match(importedId, /^gym-import-restore-/);
    assert.equal(mapping.gymsToInsert.length, 1);
    assert.equal(mapping.gymsToInsert[0].id, importedId);
    assert.equal(remapped.workouts[0].gymId, importedId);
    assert.equal(remapped.drafts[0].workout.gymId, importedId);
    assert.deepEqual(remapped.exerciseGymScopes[0].linkedGymIds, ['gym-default', importedId]);
  });

  it('maps source and reserved default IDs to the existing destination default', () => {
    const sourceGyms = [
      { id: 'source-default', name: 'Default', color: '#3B82F6', isDefault: true, createdAt: '2026-09-10T00:00:00.000Z' },
      { id: 'gym-default', name: 'Reserved', color: '#10B981', isDefault: false, createdAt: '2026-09-10T00:00:00.000Z' },
    ];
    const destinationGyms = [
      { id: 'destination-default', name: 'Home', color: '#3B82F6', isDefault: true, createdAt: '2026-09-10T00:00:00.000Z' },
    ];

    const mapping = buildGymRestoreMapping(sourceGyms, destinationGyms);
    assert.equal(mapping.idMap.get('source-default'), 'destination-default');
    assert.equal(mapping.idMap.get('gym-default'), 'destination-default');
    assert.equal(mapping.gymsToInsert.length, 0);
  });
});
