import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { Routine, WorkoutHistorySummary } from '../../src/types';
import {
  findProgramForRoutine,
  formatDaysAgo,
  parseRoutinePrograms,
  removeProgramFolder,
  renameProgramFolder,
  resolveProgramState,
  resolveProgramStates,
  resolveRotation,
  RoutineProgram,
  serializeRoutinePrograms,
  withNextOverride,
} from '../../src/workout/programs';
import { suggestNextTarget } from '../../src/workout/overload';

const routine = (id: string, folderName: string | undefined, createdAt = '2026-09-01T00:00:00.000Z'): Routine => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  folderName,
  exercises: [],
  createdAt,
});

const done = (id: string, routineId: string | undefined, startTime: string): WorkoutHistorySummary => ({
  id,
  name: routineId || 'Empty',
  routineId,
  gymId: 'gym-default',
  startTime,
  durationSeconds: 3600,
  totalVolumeKg: 1000,
  totalSets: 15,
  exerciseNames: [],
});

const routines = [routine('push', 'PPL'), routine('pull', 'PPL'), routine('legs', 'PPL'), routine('arms', undefined)];
const program: RoutineProgram = {
  folderName: 'PPL',
  routineIds: ['push', 'pull', 'legs'],
  startedAt: '2026-10-01T00:00:00.000Z',
};

describe('routine rotations', () => {
  it('starts at the first routine with no history', () => {
    const state = resolveProgramState(program, routines, [])!;
    assert.equal(state.next.id, 'push');
    assert.equal(state.cycle, 1);
    assert.equal(state.doneInCycle, 0);
    assert.equal(state.lastWorkout, undefined);
  });

  it('moves to the routine after the last one finished', () => {
    const history = [
      done('w1', 'push', '2026-10-02T10:00:00.000Z'),
      done('w2', 'pull', '2026-10-04T10:00:00.000Z'),
      done('w3', 'arms', '2026-10-05T10:00:00.000Z'),
    ];
    const state = resolveProgramState(program, routines, history)!;
    assert.equal(state.next.id, 'legs');
    assert.equal(state.lastRoutine?.id, 'pull');
    assert.equal(state.doneInCycle, 2);
  });

  it('wraps around and counts cycles', () => {
    const history = ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'push'].map((id, i) =>
      done(`w${i}`, id, `2026-10-0${i + 2}T10:00:00.000Z`),
    );
    const state = resolveProgramState(program, routines, history)!;
    assert.equal(state.next.id, 'pull');
    assert.equal(state.cycle, 3);
    assert.equal(state.doneInCycle, 1);
  });

  it('ignores workouts from before the rotation started', () => {
    const state = resolveProgramState(program, routines, [done('w0', 'push', '2026-09-20T10:00:00.000Z')])!;
    assert.equal(state.next.id, 'push');
    assert.equal(state.lastWorkout, undefined);
  });

  it('honours a skip until a rotation workout finishes after it', () => {
    const history = [done('w1', 'push', '2026-10-02T10:00:00.000Z')];
    const skipped = withNextOverride(program, 'legs', new Date('2026-10-03T08:00:00.000Z'));
    assert.equal(resolveProgramState(skipped, routines, history)!.next.id, 'legs');
    assert.equal(resolveProgramState(skipped, routines, history)!.isOverridden, true);

    const after = [...history, done('w2', 'legs', '2026-10-03T18:00:00.000Z')];
    const state = resolveProgramState(skipped, routines, after)!;
    assert.equal(state.isOverridden, false);
    assert.equal(state.next.id, 'push');
  });

  it('marks every Nth cycle as a deload', () => {
    const withDeload = { ...program, deloadEvery: 2 };
    assert.equal(resolveProgramState(withDeload, routines, [])!.isDeload, false);
    const oneCycle = ['push', 'pull', 'legs'].map((id, i) => done(`w${i}`, id, `2026-10-0${i + 2}T10:00:00.000Z`));
    const state = resolveProgramState(withDeload, routines, oneCycle)!;
    assert.equal(state.cycle, 2);
    assert.equal(state.isDeload, true);
  });

  it('keeps the saved order, drops deleted or moved routines and appends new ones', () => {
    const current = [
      routine('pull', 'PPL'),
      routine('legs', 'Other'),
      routine('push', 'PPL'),
      routine('core', 'PPL', '2026-10-05T00:00:00.000Z'),
      routine('upper', 'PPL', '2026-10-04T00:00:00.000Z'),
    ];
    assert.deepEqual(resolveRotation(program, current).map((r) => r.id), ['push', 'pull', 'upper', 'core']);
  });

  it('has no state with fewer than two routines left', () => {
    assert.equal(resolveProgramState(program, [routine('push', 'PPL')], []), null);
    const states = resolveProgramStates({ PPL: program, Solo: { ...program, folderName: 'Solo' } }, routines, []);
    assert.deepEqual(states.map((state) => state.program.folderName), ['PPL']);
  });

  it('finds the program a routine belongs to', () => {
    assert.equal(findProgramForRoutine({ PPL: program }, routines[1])?.folderName, 'PPL');
    assert.equal(findProgramForRoutine({ PPL: program }, routines[3]), undefined);
    assert.equal(findProgramForRoutine({ PPL: program }, undefined), undefined);
  });
});

describe('stored programs', () => {
  it('round-trips and drops malformed entries', () => {
    const stored = serializeRoutinePrograms({ PPL: { ...program, deloadEvery: 4, nextOverride: { routineId: 'legs', setAt: '2026-10-03T08:00:00.000Z' } } });
    assert.deepEqual(parseRoutinePrograms(stored).PPL.deloadEvery, 4);
    assert.deepEqual(parseRoutinePrograms(stored).PPL.nextOverride?.routineId, 'legs');
    assert.deepEqual(parseRoutinePrograms(null), {});
    assert.deepEqual(parseRoutinePrograms('not json'), {});
    assert.deepEqual(parseRoutinePrograms('[]'), {});
    const mixed = parseRoutinePrograms(JSON.stringify({
      Good: { routineIds: ['a', 'a', 7, 'b'], startedAt: '2026-10-01T00:00:00.000Z', deloadEvery: 1 },
      NoDate: { routineIds: ['a'], startedAt: 'soon' },
      NoIds: { startedAt: '2026-10-01T00:00:00.000Z' },
    }));
    assert.deepEqual(Object.keys(mixed), ['Good']);
    assert.deepEqual(mixed.Good.routineIds, ['a', 'b']);
    assert.equal(mixed.Good.deloadEvery, undefined);
    assert.equal(mixed.Good.folderName, 'Good');
  });

  it('follows folder renames and deletes', () => {
    const renamed = renameProgramFolder({ PPL: program }, 'PPL', 'Push Pull Legs');
    assert.deepEqual(Object.keys(renamed), ['Push Pull Legs']);
    assert.equal(renamed['Push Pull Legs'].folderName, 'Push Pull Legs');
    const merged = renameProgramFolder({ PPL: program, Other: { ...program, folderName: 'Other' } }, 'PPL', 'Other');
    assert.deepEqual(Object.keys(merged), ['Other']);
    assert.deepEqual(removeProgramFolder({ PPL: program }, 'PPL'), {});
    assert.deepEqual(Object.keys(removeProgramFolder({ PPL: program }, 'Nope')), ['PPL']);
  });

  it('formats how long ago the last workout was', () => {
    const now = new Date(2026, 9, 11, 20, 0);
    assert.equal(formatDaysAgo(new Date(2026, 9, 11, 7, 0).toISOString(), now), 'today');
    assert.equal(formatDaysAgo(new Date(2026, 9, 10, 23, 0).toISOString(), now), 'yesterday');
    assert.equal(formatDaysAgo(new Date(2026, 9, 8, 9, 0).toISOString(), now), '3 days ago');
    assert.equal(formatDaysAgo(new Date(2026, 9, 2, 9, 0).toISOString(), now), '1 week ago');
    assert.equal(formatDaysAgo(new Date(2026, 8, 20, 9, 0).toISOString(), now), '3 weeks ago');
  });
});

describe('deload targets', () => {
  const ghost = (weightKg: number, reps: number) => ({ previousType: 'normal' as const, previousWeightKg: weightKg, previousReps: reps });

  it('drops to about 90% on a loadable step and keeps the bottom of the range', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(100, 10), ghost(100, 9)],
      targetReps: '8-12',
      trackingType: 'weight_reps',
      equipment: 'barbell',
      unit: 'kg',
      deload: true,
    });
    assert.equal(suggestion?.kind, 'deload');
    assert.equal(suggestion?.weightKg, 90);
    assert.equal(suggestion?.reps, 8);
    assert.match(suggestion!.reason, /Deload week/);
  });

  it('rounds down in pounds and still works for list targets', () => {
    const suggestion = suggestNextTarget({
      sets: [ghost(102.06, 5)],
      targetReps: '5, 3, 1',
      trackingType: 'weight_reps',
      unit: 'lb',
      deload: true,
    });
    // 225 lb × 0.9 = 202.5, down to 200 lb.
    assert.equal(suggestion?.weightKg, 90.72);
    assert.equal(suggestion?.reps, 5);
  });

  it('never drops below one step', () => {
    const suggestion = suggestNextTarget({ sets: [ghost(2, 12)], trackingType: 'weight_reps', equipment: 'dumbbell', unit: 'kg', deload: true });
    assert.equal(suggestion?.weightKg, 2);
  });
});

describe('cycle progress', () => {
  it('marks only routines finished this cycle as done, not skipped ones', () => {
    const history = [
      done('w1', 'push', '2026-10-02T10:00:00.000Z'),
      done('w2', 'pull', '2026-10-03T10:00:00.000Z'),
      done('w3', 'legs', '2026-10-04T10:00:00.000Z'),
      done('w4', 'pull', '2026-10-06T10:00:00.000Z'),
    ];
    const state = resolveProgramState(program, routines, history)!;
    assert.equal(state.cycle, 2);
    assert.deepEqual(state.doneThisCycleIds, ['pull']);
    assert.equal(state.next.id, 'legs');
  });
});
