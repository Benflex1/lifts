import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseWorkoutCsv } from '../../src/utils/importer/csv-parser';

describe('Hevy CSV Parser', () => {
  it('parses Hevy CSV with weight_kg and multiple set types', () => {
    const csv = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_miles","duration_seconds","rpe"
"Upper Body A","15 Jul 2024, 09:30","15 Jul 2024, 10:45","Felt great today","Bench Press (Barbell)",,"Paused on chest",1,"warmup",60,10,,,
"Upper Body A","15 Jul 2024, 09:30","15 Jul 2024, 10:45","Felt great today","Bench Press (Barbell)",,,"2","normal",100,8,,,8.5
"Upper Body A","15 Jul 2024, 09:30","15 Jul 2024, 10:45","Felt great today","Bench Press (Barbell)",,,"3","failure",100,6,,,10
"Upper Body A","15 Jul 2024, 09:30","15 Jul 2024, 10:45","Felt great today","Incline Dumbbell Press",,,"1","normal",36,10,,,8
"Upper Body A","15 Jul 2024, 09:30","15 Jul 2024, 10:45","Felt great today","Lat Pulldown (Cable)",,,"1","normal",75,12,,,
"Upper Body A","15 Jul 2024, 09:30","15 Jul 2024, 10:45","Felt great today","Lat Pulldown (Cable)",,,"2","dropset",50,15,,,`;

    const { sessions, detectedFormat, formatLabel } = parseWorkoutCsv(csv);

    assert.equal(detectedFormat, 'hevy');
    assert.equal(formatLabel, 'Hevy');
    assert.equal(sessions.length, 1);

    const session = sessions[0];
    assert.equal(session.name, 'Upper Body A');
    assert.equal(session.notes, 'Felt great today');
    assert.equal(session.exerciseGroups.length, 3);

    // Bench Press sets
    const benchGroup = session.exerciseGroups[0];
    assert.equal(benchGroup.matchedExercise.id, 'Barbell_Bench_Press_-_Medium_Grip');
    assert.equal(benchGroup.sets.length, 3);

    assert.equal(benchGroup.sets[0].type, 'warmup');
    assert.equal(benchGroup.sets[0].weightKg, 60);
    assert.equal(benchGroup.sets[0].reps, 10);
    assert.equal(benchGroup.sets[0].notes, 'Paused on chest');

    assert.equal(benchGroup.sets[1].type, 'normal');
    assert.equal(benchGroup.sets[1].weightKg, 100);
    assert.equal(benchGroup.sets[1].reps, 8);
    assert.equal(benchGroup.sets[1].rpe, 8.5);

    assert.equal(benchGroup.sets[2].type, 'failure');
    assert.equal(benchGroup.sets[2].rpe, 10);

    // Lat Pulldown drop set
    const latGroup = session.exerciseGroups[2];
    assert.equal(latGroup.sets[1].type, 'drop');
    assert.equal(latGroup.sets[1].weightKg, 50);
  });

  it('accurately converts weight_lbs to kg in Hevy exports', () => {
    const csv = `"title","start_time","end_time","description","exercise_title","set_index","set_type","weight_lbs","reps","rpe"
"Legs","2024-06-01 10:00:00","2024-06-01 11:00:00","","Squat (Barbell)",1,"normal",225,5,8`;

    const { sessions } = parseWorkoutCsv(csv);
    assert.equal(sessions.length, 1);
    const squatSet = sessions[0].exerciseGroups[0].sets[0];
    // 225 lbs = 102.06 kg
    assert.equal(Math.round(squatSet.weightKg * 10) / 10, 102.1);
  });
});
