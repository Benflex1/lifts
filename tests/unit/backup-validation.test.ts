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
    assert.equal(parsed.version, 3);
    assert.equal(parsed.workouts.length, 1);
    assert.deepEqual(parsed.gyms.map((gym) => gym.id), ['gym-default']);
    assert.equal(parsed.workouts[0].gymId, 'gym-default');
    assert.equal(parsed.settings.unit, 'kg');
  });

  it('accepts valid v3 backup with gyms and scope overrides', () => {
    const v3Backup = {
      ...validBaseBackup,
      version: 3,
      workouts: validBaseBackup.workouts.map((workout) => ({ ...workout, gymId: 'gym-default' })),
      gyms: [
        {
          id: 'gym-default',
          name: 'Default Gym',
          color: '#3B82F6',
          isDefault: true,
          createdAt: '2026-09-10T00:00:00.000Z',
        },
        {
          id: 'gym-a',
          name: 'Gym A',
          color: '#10B981',
          isDefault: false,
          createdAt: '2026-09-10T00:00:00.000Z',
        },
      ],
      exerciseGymScopes: [{
        exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
        scopeType: 'linked_group',
        linkedGymIds: ['gym-default', 'gym-a'],
      }],
    };

    const parsed = parseBackup(JSON.stringify(v3Backup));
    assert.equal(parsed.version, 3);
    assert.deepEqual(parsed.gyms.map((gym) => gym.id), ['gym-default', 'gym-a']);
    assert.deepEqual(parsed.exerciseGymScopes[0].linkedGymIds, ['gym-default', 'gym-a']);
  });

  it('rejects invalid gym IDs, duplicate gyms, and invalid gym fields', () => {
    const v3 = {
      ...validBaseBackup,
      version: 3,
      workouts: validBaseBackup.workouts.map((workout) => ({ ...workout, gymId: 'gym-default' })),
      gyms: [{
        id: 'gym-default', name: 'Default Gym', color: '#3B82F6', isDefault: true,
        createdAt: '2026-09-10T00:00:00.000Z',
      }],
      exerciseGymScopes: [],
    };

    assert.throws(() => parseBackup(JSON.stringify({
      ...v3,
      gyms: [{ ...v3.gyms[0], id: '' }],
    })), /Invalid gym ID/);
    assert.throws(() => parseBackup(JSON.stringify({
      ...v3,
      gyms: [v3.gyms[0], { ...v3.gyms[0], isDefault: false }],
    })), /Duplicate gym ID/);
    assert.throws(() => parseBackup(JSON.stringify({
      ...v3,
      gyms: [{ ...v3.gyms[0], name: '   ' }],
    })), /gym name cannot be empty/);
    assert.throws(() => parseBackup(JSON.stringify({
      ...v3,
      gyms: [{ ...v3.gyms[0], color: '#06B6D4' }],
    })), /approved palette/);
  });

  it('rejects malformed linked scope IDs and missing scope references', () => {
    const v3 = {
      ...validBaseBackup,
      version: 3,
      workouts: validBaseBackup.workouts.map((workout) => ({ ...workout, gymId: 'gym-default' })),
      gyms: [{
        id: 'gym-default', name: 'Default Gym', color: '#3B82F6', isDefault: true,
        createdAt: '2026-09-10T00:00:00.000Z',
      }],
      exerciseGymScopes: [],
    };

    assert.throws(() => parseBackup(JSON.stringify({
      ...v3,
      exerciseGymScopes: [{
        exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
        scopeType: 'linked_group',
        linkedGymIds: 'gym-default',
      }],
    })), /linked gym IDs/);
    assert.throws(() => parseBackup(JSON.stringify({
      ...v3,
      exerciseGymScopes: [{
        exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
        scopeType: 'linked_group',
        linkedGymIds: ['gym-default', 'missing-gym'],
      }],
    })), /unknown gym/);
  });

  it('rejects a routine that omits its exercises array', () => {
    const malformedRoutine = {
      ...validBaseBackup,
      routines: [{ id: 'r1', name: 'Broken Routine' }],
    };

    assert.throws(() => {
      parseBackup(JSON.stringify(malformedRoutine));
    }, /Invalid exercises in routine r1/);
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

  it('accepts valid drafts in backup', () => {
    const backupWithDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: '2026-09-07T11:00:00.000Z',
            durationSeconds: 120,
            totalVolumeKg: 500,
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                orderIndex: 0,
                sets: [
                  { id: 'ds1', setNumber: 1, type: 'normal', weightKg: 80, reps: 8, isCompleted: true, rpe: 7.5 },
                ],
              },
            ],
          },
          savedAt: '2026-09-07T11:02:00.000Z',
          revision: 1,
          restTimer: { endsAt: Date.now() + 60000, totalSeconds: 60 },
        },
      ],
    };

    const parsed = parseBackup(JSON.stringify(backupWithDraft));
    assert.equal(parsed.drafts.length, 1);
    assert.equal(parsed.drafts[0].workout.id, 'draft-1');
  });

  it('rejects draft containing invalid timestamp', () => {
    const badDraftSavedAt = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [],
          },
          savedAt: 'invalid-date',
          revision: 1,
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badDraftSavedAt));
    }, /Invalid timestamp/);

    const badDraftStartTime = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: 'not-a-valid-date',
            exercises: [],
          },
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badDraftStartTime));
    }, /Invalid timestamp/);
  });

  it('rejects draft containing exercises: null or missing exercises array', () => {
    const nullExercisesDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: null,
          },
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(nullExercisesDraft));
    }, /Invalid exercises in draft workout/);
  });

  it('rejects draft referencing unknown exercise', () => {
    const unknownExDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'nonexistent-exercise-xyz',
                orderIndex: 0,
                sets: [],
              },
            ],
          },
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(unknownExDraft));
    }, /Missing exercise definition/);
  });

  it('rejects draft containing invalid set weight, reps, or RPE', () => {
    const badWeightDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                orderIndex: 0,
                sets: [
                  { id: 's1', setNumber: 1, type: 'normal', weightKg: -10, reps: 5, isCompleted: true },
                ],
              },
            ],
          },
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badWeightDraft));
    }, /Invalid weightKg/);

    const badRpeDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          workout: {
            id: 'draft-1',
            name: 'Draft Workout',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                orderIndex: 0,
                sets: [
                  { id: 's1', setNumber: 1, type: 'normal', weightKg: 50, reps: 5, isCompleted: true, rpe: 12 },
                ],
              },
            ],
          },
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badRpeDraft));
    }, /Invalid RPE/);
  });

  it('reconstructs missing embedded exercise objects in draft from referenced definition', () => {
    const backupWithOmittedExercise = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
          workout: {
            id: 'draft-missing-ex',
            name: 'Draft Without Embedded Exercise',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                orderIndex: 0,
                sets: [
                  { id: 's1', setNumber: 1, type: 'normal', weightKg: 100, reps: 5, isCompleted: true },
                ],
              },
            ],
          },
        },
      ],
    };

    const parsed = parseBackup(JSON.stringify(backupWithOmittedExercise));
    const embeddedEx = parsed.drafts[0].workout.exercises[0].exercise;
    assert.ok(embeddedEx, 'Embedded exercise object must be reconstructed');
    assert.equal(embeddedEx.name, 'Bench Press (Barbell)');
    assert.ok(Array.isArray(embeddedEx.primaryMuscles), 'primaryMuscles must be an array');
    assert.ok(embeddedEx.primaryMuscles.length > 0);
    assert.equal(typeof embeddedEx.equipment, 'string');
  });

  it('rejects draft containing invalid primaryMuscles in embedded exercise object', () => {
    const stringMusclesDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
          workout: {
            id: 'draft-bad-muscles',
            name: 'Draft Bad Muscles',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                exercise: {
                  id: 'Barbell_Bench_Press_-_Medium_Grip',
                  name: 'Bench Press',
                  category: 'chest',
                  equipment: 'barbell',
                  primaryMuscles: 'chest',
                },
                sets: [],
              },
            ],
          },
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(stringMusclesDraft));
    }, /Invalid primaryMuscles/);

    const nullMusclesDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
          workout: {
            id: 'draft-bad-muscles-null',
            name: 'Draft Null Muscles',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                exercise: {
                  id: 'Barbell_Bench_Press_-_Medium_Grip',
                  name: 'Bench Press',
                  category: 'chest',
                  equipment: 'barbell',
                  primaryMuscles: null,
                },
                sets: [],
              },
            ],
          },
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(nullMusclesDraft));
    }, /Invalid primaryMuscles/);

    const nonStringElementDraft = {
      ...validBaseBackup,
      drafts: [
        {
          version: 1,
          savedAt: '2026-09-07T11:00:00.000Z',
          revision: 1,
          workout: {
            id: 'draft-bad-muscles-elem',
            name: 'Draft Non-string Muscle Element',
            startTime: '2026-09-07T11:00:00.000Z',
            exercises: [
              {
                id: 'de1',
                exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
                exercise: {
                  id: 'Barbell_Bench_Press_-_Medium_Grip',
                  name: 'Bench Press',
                  category: 'chest',
                  equipment: 'barbell',
                  primaryMuscles: [123],
                },
                sets: [],
              },
            ],
          },
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(nonStringElementDraft));
    }, /Invalid primaryMuscles/);
  });

  it('rejects backup with non-string targetReps in routine or workout exercise', () => {
    const badRoutineReps = {
      ...validBaseBackup,
      routines: [
        {
          id: 'routine-bad-reps',
          name: 'Bad Reps Routine',
          exercises: [
            {
              id: 're-1',
              exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
              orderIndex: 0,
              targetSets: 3,
              targetReps: 123 as any,
              restTimerSeconds: 90,
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badRoutineReps));
    }, /Invalid targetReps/);

    const badWorkoutReps = {
      ...validBaseBackup,
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              ...validBaseBackup.workouts[0].exercises[0],
              targetReps: { invalid: true } as any,
            },
          ],
        },
      ],
    };
    assert.throws(() => {
      parseBackup(JSON.stringify(badWorkoutReps));
    }, /Invalid targetReps/);
  });

  it('accepts and preserves legacy targetReps (e.g. 8 each side) during backup restore', () => {
    const legacyBackup = {
      ...validBaseBackup,
      routines: [
        {
          id: 'routine-legacy-reps',
          name: 'Legacy Reps Routine',
          exercises: [
            {
              id: 're-leg-1',
              exerciseId: 'Barbell_Bench_Press_-_Medium_Grip',
              orderIndex: 0,
              targetSets: 3,
              targetReps: '8 each side',
              restTimerSeconds: 90,
            },
          ],
        },
      ],
      workouts: [
        {
          ...validBaseBackup.workouts[0],
          exercises: [
            {
              ...validBaseBackup.workouts[0].exercises[0],
              targetReps: '8 each side',
            },
          ],
        },
      ],
    };

    const parsed = parseBackup(JSON.stringify(legacyBackup));
    assert.equal(parsed.routines[0].exercises[0].targetReps, '8 each side');
    assert.equal(parsed.workouts[0].exercises[0].targetReps, '8 each side');
  });
});
