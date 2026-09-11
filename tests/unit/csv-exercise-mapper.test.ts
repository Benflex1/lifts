import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ExerciseMapper, normalizeExerciseName } from '../../src/utils/importer/exercise-mapper';

describe('ExerciseMapper', () => {
  const mapper = new ExerciseMapper();

  it('normalizes exercise names by removing punctuation and parentheticals', () => {
    assert.equal(normalizeExerciseName('Bench Press (Barbell)'), 'bench press');
    assert.equal(normalizeExerciseName('Incline Bench Press (Dumbbell)'), 'incline bench press');
    assert.equal(normalizeExerciseName('Lat Pulldown (Cable)'), 'lat pulldown');
  });

  it('matches Bench Press variations to Barbell Bench Press - Medium Grip', () => {
    const res1 = mapper.getOrCreateExercise('Bench Press (Barbell)');
    assert.equal(res1.isNew, false);
    assert.equal(res1.exercise.id, 'Barbell_Bench_Press_-_Medium_Grip');

    const res2 = mapper.getOrCreateExercise('Barbell Bench Press');
    assert.equal(res2.isNew, false);
    assert.equal(res2.exercise.id, 'Barbell_Bench_Press_-_Medium_Grip');
  });

  it('distinguishes Dumbbell vs Barbell presses', () => {
    const dbPress = mapper.getOrCreateExercise('Incline Bench Press (Dumbbell)');
    assert.equal(dbPress.isNew, false);
    assert.equal(dbPress.exercise.id, 'Incline_Dumbbell_Press');

    const bbPress = mapper.getOrCreateExercise('Incline Bench Press (Barbell)');
    assert.equal(bbPress.isNew, false);
    assert.equal(bbPress.exercise.id, 'Barbell_Incline_Bench_Press_-_Medium_Grip');
  });

  it('matches staple compound lifts', () => {
    const squat = mapper.getOrCreateExercise('Squat (Barbell)');
    assert.equal(squat.exercise.id, 'Barbell_Full_Squat');

    const deadlift = mapper.getOrCreateExercise('Deadlift');
    assert.equal(deadlift.exercise.id, 'Barbell_Deadlift');

    const ohp = mapper.getOrCreateExercise('Overhead Press (Barbell)');
    assert.equal(ohp.exercise.id, 'Standing_Military_Press');

    const pullup = mapper.getOrCreateExercise('Pull Up');
    assert.equal(pullup.exercise.id, 'Pullups');

    const latPulldown = mapper.getOrCreateExercise('Lat Pulldown (Cable)');
    assert.equal(latPulldown.exercise.id, 'Wide-Grip_Lat_Pulldown');
  });

  it('creates new custom exercises when movement is unrecognized', () => {
    const custom = mapper.getOrCreateExercise('Super Rare Custom Machine Lift 2000', 'Chest');
    assert.equal(custom.isNew, true);
    assert.equal(custom.exercise.isCustom, true);
    assert.equal(custom.exercise.name, 'Super Rare Custom Machine Lift 2000');
    assert.deepEqual(custom.exercise.primaryMuscles, ['chest']);
    assert.equal(custom.exercise.equipment, 'machine');

    const newExList = mapper.getNewlyCreatedExercises();
    assert.equal(newExList.length, 1);
    assert.equal(newExList[0].name, 'Super Rare Custom Machine Lift 2000');
  });

  it('correctly stems plural movement nouns', () => {
    // Leg Extensions -> Leg Extensions, Lateral Raises -> Dumbbell Lateral Raise, Bicep Curls -> Dumbbell Bicep Curl
    const legExt = mapper.getOrCreateExercise('Leg Extensions (Machine)');
    assert.equal(legExt.isNew, false);
    assert.equal(legExt.exercise.id, 'Leg_Extensions');

    const calfRaises = mapper.getOrCreateExercise('Standing Calf Raise');
    assert.equal(calfRaises.isNew, false);
    assert.equal(calfRaises.exercise.id, 'Standing_Calf_Raises');

    const legCurl = mapper.getOrCreateExercise('Lying Leg Curl');
    assert.equal(legCurl.isNew, false);
    assert.equal(legCurl.exercise.id, 'Lying_Leg_Curls');
  });

  it('expands common tracker abbreviations and synonyms', () => {
    const dbBench = mapper.getOrCreateExercise('DB Bench Press');
    assert.equal(dbBench.isNew, false);
    assert.equal(dbBench.exercise.id, 'Dumbbell_Bench_Press');

    const rdl = mapper.getOrCreateExercise('RDL (Barbell)');
    assert.equal(rdl.isNew, false);
    assert.equal(rdl.exercise.id, 'Romanian_Deadlift');

    const ohp = mapper.getOrCreateExercise('OHP');
    assert.equal(ohp.isNew, false);
    assert.equal(ohp.exercise.id, 'Standing_Military_Press');
  });

  it('prevents matching when critical movement modifiers contradict', () => {
    // "Custom Belt Squat Machine" has 'belt', must not match "Lying Machine Squat" or generic squat
    const beltSquat = mapper.getOrCreateExercise('Custom Belt Squat Machine');
    assert.equal(beltSquat.isNew, true);
    assert.equal(beltSquat.confidence, 'custom');
    assert.equal(beltSquat.exercise.name, 'Custom Belt Squat Machine');
  });

  it('applies manual overrides with highest precedence', () => {
    const customTarget: any = {
      id: 'custom-assigned-target',
      name: 'User Chosen Target Exercise',
      category: 'strength',
      equipment: 'machine',
      primaryMuscles: ['chest'],
      secondaryMuscles: [],
      instructions: [],
      isCustom: true,
    };

    const overrideMapper = new ExerciseMapper([], {
      'custom belt squat machine': customTarget,
    });

    const resolved = overrideMapper.getOrCreateExercise('Custom Belt Squat Machine');
    assert.equal(resolved.confidence, 'manual');
    assert.equal(resolved.isAutoMatched, false);
    assert.equal(resolved.exercise.id, 'custom-assigned-target');
  });

  it('tracks usage and prioritizes unassigned/custom exercises first in getExerciseAssignments()', () => {
    const trackingMapper = new ExerciseMapper();
    // Record Bench Press (matched) in 2 workouts with 5 sets total
    trackingMapper.recordUsage('Bench Press (Barbell)', 'w1');
    trackingMapper.recordUsage('Bench Press (Barbell)', 'w1');
    trackingMapper.recordUsage('Bench Press (Barbell)', 'w1');
    trackingMapper.recordUsage('Bench Press (Barbell)', 'w2');
    trackingMapper.recordUsage('Bench Press (Barbell)', 'w2');
    trackingMapper.getOrCreateExercise('Bench Press (Barbell)');

    // Record Custom Movement (unmatched) in 1 workout with 2 sets
    trackingMapper.recordUsage('Hyper Glute Thrust 9000', 'w1');
    trackingMapper.recordUsage('Hyper Glute Thrust 9000', 'w1');
    trackingMapper.getOrCreateExercise('Hyper Glute Thrust 9000');

    const assignments = trackingMapper.getExerciseAssignments();
    assert.equal(assignments.length, 2);

    // Unassigned/custom MUST come first even though it has fewer sets
    assert.equal(assignments[0].rawName, 'Hyper Glute Thrust 9000');
    assert.equal(assignments[0].isCustom, true);
    assert.equal(assignments[0].workoutCount, 1);
    assert.equal(assignments[0].setCount, 2);

    // Matched exercise comes second
    assert.equal(assignments[1].rawName, 'Bench Press (Barbell)');
    assert.equal(assignments[1].isCustom, false);
    assert.equal(assignments[1].workoutCount, 2);
    assert.equal(assignments[1].setCount, 5);
  });
});
