import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  roundToIncrement,
  getDefaultBarWeight,
  getDefaultIncrement,
  generateWarmupRamp,
  formatPlateBreakdown,
  WARMUP_PRESETS,
} from '../../src/workout/warmup';

describe('Warmup Set Progression Calculator', () => {
  it('roundToIncrement correctly rounds to Olympic plate multiples', () => {
    // 2.5 kg increments
    assert.equal(roundToIncrement(52.1, 2.5), 52.5);
    assert.equal(roundToIncrement(51.2, 2.5), 50.0);
    assert.equal(roundToIncrement(53.8, 2.5), 55.0);
    assert.equal(roundToIncrement(20.0, 2.5), 20.0);

    // 5 lb increments
    assert.equal(roundToIncrement(112.5, 5), 115);
    assert.equal(roundToIncrement(111.0, 5), 110);
    assert.equal(roundToIncrement(188.0, 5), 190);

    // 1.0 kg increment
    assert.equal(roundToIncrement(22.3, 1), 22);
    assert.equal(roundToIncrement(22.7, 1), 23);
  });

  it('getDefaultBarWeight selects appropriate default by equipment and unit', () => {
    assert.equal(getDefaultBarWeight('Barbell', 'Chest', 'kg'), 20);
    assert.equal(getDefaultBarWeight('Barbell', 'Chest', 'lb'), 45);

    // Dumbbells, cables, machines, bodyweight -> 0
    assert.equal(getDefaultBarWeight('Dumbbell', 'Arms', 'kg'), 0);
    assert.equal(getDefaultBarWeight('Cable', 'Back', 'kg'), 0);
    assert.equal(getDefaultBarWeight('Machine', 'Legs', 'kg'), 0);
    assert.equal(getDefaultBarWeight('Bodyweight', 'Core', 'kg'), 0);
    assert.equal(getDefaultBarWeight('Kettlebell', 'Shoulders', 'kg'), 0);
  });

  it('generates 4-step strength ramp for 100 kg barbell lift', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 100,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'strength',
    });

    assert.equal(ramp.length, 4);

    // Set 1: Bar x 10
    assert.equal(ramp[0].displayWeight, 20);
    assert.equal(ramp[0].reps, 10);
    assert.equal(ramp[0].label, 'Bar');
    assert.equal(formatPlateBreakdown(ramp[0].plates, 'kg'), 'Empty Bar');

    // Set 2: 50% x 5 = 50 kg
    assert.equal(ramp[1].displayWeight, 50);
    assert.equal(ramp[1].reps, 5);
    assert.equal(ramp[1].label, '50%');
    assert.equal(formatPlateBreakdown(ramp[1].plates, 'kg'), '15 / side');

    // Set 3: 70% x 3 = 70 kg
    assert.equal(ramp[2].displayWeight, 70);
    assert.equal(ramp[2].reps, 3);
    assert.equal(ramp[2].label, '70%');
    assert.equal(formatPlateBreakdown(ramp[2].plates, 'kg'), '25 / side');

    // Set 4: 85% x 1 = 85 kg
    assert.equal(ramp[3].displayWeight, 85);
    assert.equal(ramp[3].reps, 1);
    assert.equal(ramp[3].label, '85%');
    assert.equal(formatPlateBreakdown(ramp[3].plates, 'kg'), '25, 5, 2.5 / side');
  });

  it('generates lb ramp with 5 lb plate rounding for 225 lb squat', () => {
    // 225 lb in kg is ~102.06 kg
    const workingKg = 225 * 0.453592;
    const barKg = 45 * 0.453592;

    const ramp = generateWarmupRamp({
      workingWeightKg: workingKg,
      barWeightKg: barKg,
      unit: 'lb',
      preset: 'strength',
    });

    assert.equal(ramp.length, 4);
    assert.equal(ramp[0].displayWeight, 45); // Bar
    assert.equal(ramp[1].displayWeight, 115); // ~50% (112.5 rounded to 115)
    assert.equal(ramp[2].displayWeight, 160); // ~70% (157.5 rounded to 160)
    assert.equal(ramp[3].displayWeight, 190); // ~85% (191.25 rounded to 190)
  });

  it('generates 3-step hypertrophy ramp', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 80,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'hypertrophy',
    });

    assert.equal(ramp.length, 3);
    assert.equal(ramp[0].displayWeight, 20); // Bar x 10
    assert.equal(ramp[0].reps, 10);
    assert.equal(ramp[1].displayWeight, 47.5); // 60% of 80 = 48 -> rounded 47.5
    assert.equal(ramp[1].reps, 6);
    assert.equal(ramp[2].displayWeight, 65); // 80% of 80 = 64 -> rounded 65
    assert.equal(ramp[2].reps, 3);
  });

  it('generates 2-step quick ramp', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 100,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'quick',
    });

    assert.equal(ramp.length, 2);
    assert.equal(ramp[0].displayWeight, 50); // 50% x 5
    assert.equal(ramp[0].reps, 5);
    assert.equal(ramp[1].displayWeight, 75); // 75% x 3
    assert.equal(ramp[1].reps, 3);
  });

  it('generates 5-step heavy / powerlifting ramp', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 140,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'heavy',
    });

    assert.equal(ramp.length, 5);
    assert.equal(ramp[0].displayWeight, 20); // Bar x 10
    assert.equal(ramp[1].displayWeight, 70); // 50% x 5
    assert.equal(ramp[2].displayWeight, 90); // 65% of 140 = 91 -> 90 x 3
    assert.equal(ramp[3].displayWeight, 112.5); // 80% of 140 = 112 -> 112.5 x 2
    assert.equal(ramp[4].displayWeight, 125); // 90% of 140 = 126 -> 125 x 1
  });

  it('handles dumbbell / cable exercises (0 kg bar baseline)', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 30,
      barWeightKg: 0,
      unit: 'kg',
      preset: 'strength',
    });

    // 0 bar weight -> steps do not clamp to 20kg bar
    assert.ok(ramp.length >= 3);
    assert.equal(ramp[0].displayWeight, 15); // 50% of 30
    assert.equal(ramp[1].displayWeight, 20); // 70% of 30 = 21 -> 20
    assert.equal(ramp[2].displayWeight, 25); // 85% of 30 = 25.5 -> 25
  });

  it('deduplicates steps that collapse to the same weight when working weight is light', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 30,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'strength',
    });

    // 50% of 30 is 15kg (< 20kg bar) -> clamps to 20kg bar
    // 70% of 30 is 21kg -> rounds to 20kg or 22.5kg
    // The duplicate 20kg bar sets must be deduplicated!
    const weights = ramp.map((s) => s.displayWeight);
    const uniqueWeights = new Set(weights);
    assert.equal(weights.length, uniqueWeights.size);
    // Warmup sets must not exceed or equal 30kg
    assert.ok(weights.every((w) => w < 30));
  });

  it('handles empty or zero working weight gracefully', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 0,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'strength',
    });
    assert.deepEqual(ramp, []);
  });

  it('handles working weight equal to bar weight', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 20,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'strength',
    });
    assert.equal(ramp.length, 1);
    assert.equal(ramp[0].displayWeight, 20);
  });
});
