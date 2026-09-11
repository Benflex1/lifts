import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseWorkoutCsv } from '../../src/utils/importer/csv-parser';

describe('FitNotes CSV Parser', () => {
  it('parses FitNotes CSV format with Category and date grouping', () => {
    const csv = `Date,Exercise,Category,Weight (kg),Reps,Distance,Distance Unit,Time,Notes,Kind
2024-07-01,Deadlift,Back,140,5,,,,,
2024-07-01,Deadlift,Back,160,3,,,,,
2024-07-01,Pull-Up,Back,0,10,,,,Bodyweight,
2024-07-01,Pull-Up,Back,0,8,,,,,
2024-07-01,Barbell Curl,Biceps,35,10,,,,,`;

    const { sessions, detectedFormat, formatLabel } = parseWorkoutCsv(csv);

    assert.equal(detectedFormat, 'fitnotes');
    assert.equal(formatLabel, 'FitNotes');
    assert.equal(sessions.length, 1);

    const s = sessions[0];
    assert.ok(s.name.includes('2024-07-01'));
    assert.equal(s.exerciseGroups.length, 3);

    // Deadlift
    assert.equal(s.exerciseGroups[0].matchedExercise.id, 'Barbell_Deadlift');
    assert.equal(s.exerciseGroups[0].sets.length, 2);
    assert.equal(s.exerciseGroups[0].sets[0].weightKg, 140);
    assert.equal(s.exerciseGroups[0].sets[1].weightKg, 160);

    // Pull-up 0 kg preserved
    assert.equal(s.exerciseGroups[1].matchedExercise.id, 'Pullups');
    assert.equal(s.exerciseGroups[1].sets[0].weightKg, 0);
    assert.equal(s.exerciseGroups[1].sets[0].reps, 10);

    // Barbell curl
    assert.equal(s.exerciseGroups[2].matchedExercise.id, 'Barbell_Curl');
    assert.equal(s.exerciseGroups[2].sets[0].weightKg, 35);
  });
});
