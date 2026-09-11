import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseWorkoutCsv } from '../../src/utils/importer/csv-parser';

describe('Strong CSV Parser', () => {
  it('parses Strong CSV with semicolon delimiters and duration strings', () => {
    const csv = `Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes
2024-05-20 18:00:00;Push Day;1h 10m;Barbell Bench Press;1;60;kg;10;;;;;Warmup set;Great session
2024-05-20 18:00:00;Push Day;1h 10m;Barbell Bench Press;2;100;kg;8;8.5;;;;;Great session
2024-05-20 18:00:00;Push Day;1h 10m;Barbell Bench Press;3;102.5;kg;6;9.5;;;;;Great session
2024-05-20 18:00:00;Push Day;1h 10m;Overhead Press;1;60;kg;8;8;;;;;Great session
2024-05-20 18:00:00;Push Day;1h 10m;Triceps Pushdown;1;35;kg;12;;;;;;Great session`;

    const { sessions, detectedFormat, formatLabel } = parseWorkoutCsv(csv);

    assert.equal(detectedFormat, 'strong');
    assert.equal(formatLabel, 'Strong');
    assert.equal(sessions.length, 1);

    const s = sessions[0];
    assert.equal(s.name, 'Push Day');
    assert.equal(s.durationSeconds, 4200); // 1h 10m = 4200s
    assert.equal(s.exerciseGroups.length, 3);

    const benchSets = s.exerciseGroups[0].sets;
    assert.equal(benchSets.length, 3);
    assert.equal(benchSets[0].type, 'warmup'); // detected from notes "Warmup set"
    assert.equal(benchSets[0].weightKg, 60);
    assert.equal(benchSets[1].weightKg, 100);
    assert.equal(benchSets[1].rpe, 8.5);
    assert.equal(benchSets[2].weightKg, 102.5);
    assert.equal(benchSets[2].rpe, 9.5);
  });

  it('parses Strong CSV with comma delimiters and lbs weight unit', () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes
"2024-05-20 18:00:00","Pull Day","45m","Deadlift",1,315,"lbs",5,"8.5",,,,"","Solid pulls"
"2024-05-20 18:00:00","Pull Day","45m","Dumbbell Bicep Curl",1,35,"lbs",10,"",,,,"","Solid pulls"`;

    const { sessions } = parseWorkoutCsv(csv);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].durationSeconds, 2700); // 45m
    const deadliftSet = sessions[0].exerciseGroups[0].sets[0];
    // 315 lbs = 142.88 kg
    assert.equal(Math.round(deadliftSet.weightKg * 10) / 10, 142.9);
  });
});
