import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { detectDelimiter, tokenizeCsv } from '../../src/utils/importer/tokenizer';

describe('CSV Tokenizer', () => {
  it('detects comma, semicolon, and tab delimiters accurately', () => {
    assert.equal(detectDelimiter('Date,Workout,Exercise,Weight,Reps'), ',');
    assert.equal(detectDelimiter('Date;Workout Name;Duration;Exercise Name;Set Order;Weight'), ';');
    assert.equal(detectDelimiter('Date\tWorkout\tExercise\tWeight\tReps'), '\t');
  });

  it('parses standard comma-delimited rows', () => {
    const csv = 'Date,Workout,Exercise\n2024-05-01,Push,Bench Press\n2024-05-02,Pull,Deadlift';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], ['Date', 'Workout', 'Exercise']);
    assert.deepEqual(rows[1], ['2024-05-01', 'Push', 'Bench Press']);
    assert.deepEqual(rows[2], ['2024-05-02', 'Pull', 'Deadlift']);
  });

  it('parses semicolon-delimited CSVs correctly', () => {
    const csv = 'Date;Workout;Exercise\n2024-05-01;Push;Bench Press';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ['Date', 'Workout', 'Exercise']);
    assert.deepEqual(rows[1], ['2024-05-01', 'Push', 'Bench Press']);
  });

  it('handles quotes with embedded delimiters', () => {
    const csv = '"Date","Workout Name","Exercise"\n"2024-05-01","Push Day, Heavy","Bench Press, Paused"';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], ['2024-05-01', 'Push Day, Heavy', 'Bench Press, Paused']);
  });

  it('handles escaped quotes ("")', () => {
    const csv = 'Workout,Notes\n"Chest","Felt ""strong"" today"';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[1][1], 'Felt "strong" today');
  });

  it('handles multiline cells with embedded newlines', () => {
    const csv = 'Workout,Notes\n"Leg Day","Line 1\nLine 2\nLine 3"';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[1][0], 'Leg Day');
    assert.equal(rows[1][1], 'Line 1\nLine 2\nLine 3');
  });

  it('strips UTF-8 BOM if present at start', () => {
    const csv = '\uFEFFDate,Workout\n2024-01-01,Test';
    const rows = tokenizeCsv(csv);
    assert.equal(rows[0][0], 'Date');
  });

  it('handles CRLF line endings', () => {
    const csv = 'A,B,C\r\n1,2,3\r\n4,5,6\r\n';
    const rows = tokenizeCsv(csv);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[1], ['1', '2', '3']);
    assert.deepEqual(rows[2], ['4', '5', '6']);
  });
});
