import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseBackup, MAX_BACKUP_SIZE_BYTES } from '../../src/utils/backup';

describe('Backup validation (parseBackup)', () => {
  const validBaseBackup = {
    version: 2,
    exportedAt: '2026-09-07T10:00:00.000Z',
    workouts: [
      {
        id: 'w1',
        name: 'Full Body',
        startTime: '2026-09-07T09:00:00.000Z',
        durationSeconds: 3600,
        totalVolumeKg: 1000,
        exercises: [
          {
            id: 'we1',
            exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
            orderIndex: 0,
            sets: [
              {
                id: 's1',
                setNumber: 1,
                type: 'normal',
                weightKg: 100,
                reps: 10,
                isCompleted: true,
                rpe: 8,
              },
            ],
          },
        ],
      },
    ],
    routines: [],
    exercises: [
      {
        id: 'Barbell_Bench_Press_-_Medium_Grip',
        name: 'Bench Press (Barbell)',
        category: 'chest',
        bodyPart: 'chest',
        equipment: 'barbell',
        targetMuscle: 'pectorals',
      },
    ],
    drafts: [],
    settings: { unit: 'kg' },
  };

  it('accepts valid v2 backup', () => {
    const json = JSON.stringify(validBaseBackup);
    const parsed = parseBackup(json);
    assert.equal(parsed.version, 2);
    assert.equal(parsed.workouts.length, 1);
    assert.equal(parsed.settings.unit, 'kg');
  });

  it('rejects malformed JSON', () => {
    assert.throws(() => {
      parseBackup('{ not valid json }');
    }, /Invalid JSON/);
  });

  it('rejects oversize input (> 50 MiB)', () => {
    // Generate string exceeding limit
    const hugeString = ' '.repeat(MAX_BACKUP_SIZE_BYTES + 1);
    assert.throws(() => {
      parseBackup(hugeString);
    }, /50 MiB/);
  });

  it('rejects v1 summary-only data with explicit explanation', () => {
    const v1Data = {
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      workouts: [{ id: 'w1', name: 'Push', totalVolumeKg: 5000 }],
      routines: [],
      exercises: [],
      settings: { unit: 'kg' },
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(v1Data));
    }, /Version 1 backups contain only summary data/);
  });

  it('rejects unknown version', () => {
    const badVersion = { ...validBaseBackup, version: 99 };
    assert.throws(() => {
      parseBackup(JSON.stringify(badVersion));
    }, /Unsupported backup version/);
  });

  it('rejects duplicate workout IDs', () => {
    const dupes = {
      ...validBaseBackup,
      workouts: [
        validBaseBackup.workouts[0],
        { ...validBaseBackup.workouts[0] },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(dupes));
    }, /Duplicate workout ID/);
  });

  it('rejects duplicate routine IDs', () => {
    const dupes = {
      ...validBaseBackup,
      routines: [
        { id: 'r1', name: 'R1', createdAt: '2026-01-01T00:00:00.000Z', exercises: [] },
        { id: 'r1', name: 'R1 duplicate', createdAt: '2026-01-01T00:00:00.000Z', exercises: [] },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(dupes));
    }, /Duplicate routine ID/);
  });

  it('rejects duplicate set IDs within a workout', () => {
    const dupSets = {
      ...validBaseBackup,
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              ...validBaseBackup.workouts[0].exercises[0],
              sets: [
                { id: 'same-set-id', setNumber: 1, type: 'normal', weightKg: 50, reps: 10, isCompleted: true },
                { id: 'same-set-id', setNumber: 2, type: 'normal', weightKg: 50, reps: 10, isCompleted: true },
              ],
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(dupSets));
    }, /Duplicate set ID/);
  });

  it('rejects missing exercise reference when not in backup and not in bundled seed list', () => {
    const missingEx = {
      ...validBaseBackup,
      exercises: [], // empty exercises list
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              id: 'we1',
              exerciseId: 'completely_unknown_nonexistent_exercise_xyz_999',
              orderIndex: 0,
              sets: [],
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(missingEx));
    }, /Missing exercise definition/);
  });

  it('rejects negative or non-finite weight', () => {
    const negWeight = {
      ...validBaseBackup,
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              ...validBaseBackup.workouts[0].exercises[0],
              sets: [
                { id: 's1', setNumber: 1, type: 'normal', weightKg: -5, reps: 5, isCompleted: true },
              ],
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(negWeight));
    }, /Invalid weightKg/);

    const nanWeight = JSON.parse(JSON.stringify(validBaseBackup));
    nanWeight.workouts[0].exercises[0].sets[0].weightKg = null;
    assert.throws(() => {
      parseBackup(JSON.stringify(nanWeight));
    }, /Invalid weightKg/);
  });

  it('rejects invalid set types', () => {
    const badType = {
      ...validBaseBackup,
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              ...validBaseBackup.workouts[0].exercises[0],
              sets: [
                { id: 's1', setNumber: 1, type: 'superset_unknown', weightKg: 50, reps: 5, isCompleted: true },
              ],
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badType));
    }, /Invalid set type/);
  });

  it('rejects invalid RPE (< 1 or > 10)', () => {
    const badRpe = {
      ...validBaseBackup,
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              ...validBaseBackup.workouts[0].exercises[0],
              sets: [
                { id: 's1', setNumber: 1, type: 'normal', weightKg: 50, reps: 5, isCompleted: true, rpe: 15 },
              ],
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badRpe));
    }, /Invalid RPE/);
  });

  it('rejects invalid timestamps', () => {
    const badTimestamp = {
      ...validBaseBackup,
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          startTime: 'not-a-timestamp',
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badTimestamp));
    }, /Invalid timestamp/);
  });
});
