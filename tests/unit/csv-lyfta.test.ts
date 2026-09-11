import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseWorkoutCsv } from '../../src/utils/importer/csv-parser';

describe('Lyfta CSV Parser', () => {
  it('parses Lyfta CSV format with multiple exercises and sets', () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Notes
"2024-06-10 08:00","Leg Day","Barbell Full Squat",1,100,5,""
"2024-06-10 08:00","Leg Day","Barbell Full Squat",2,100,5,""
"2024-06-10 08:00","Leg Day","Barbell Full Squat",3,100,5,""
"2024-06-10 08:00","Leg Day","Romanian Deadlift",1,80,8,""
"2024-06-10 08:00","Leg Day","Romanian Deadlift",2,80,8,""`;

    const { sessions, detectedFormat, formatLabel } = parseWorkoutCsv(csv);

    assert.equal(detectedFormat, 'lyfta');
    assert.equal(formatLabel, 'Lyfta');
    assert.equal(sessions.length, 1);

    const s = sessions[0];
    assert.equal(s.name, 'Leg Day');
    assert.equal(s.exerciseGroups.length, 2);

    const squatGroup = s.exerciseGroups[0];
    assert.equal(squatGroup.matchedExercise.id, 'Barbell_Full_Squat');
    assert.equal(squatGroup.sets.length, 3);
    assert.equal(squatGroup.sets[0].weightKg, 100);
    assert.equal(squatGroup.sets[0].reps, 5);

    const rdlGroup = s.exerciseGroups[1];
    assert.equal(rdlGroup.matchedExercise.id, 'Romanian_Deadlift');
    assert.equal(rdlGroup.sets.length, 2);
    assert.equal(rdlGroup.sets[0].weightKg, 80);
    assert.equal(rdlGroup.sets[0].reps, 8);
  });
});
