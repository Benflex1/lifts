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

  it('supports custom ramp protocols with customSteps', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 100,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'custom',
      customSteps: [
        { percentage: 0, reps: 10, useBarIfAvailable: true },
        { percentage: 0.40, reps: 8 },
        { percentage: 0.60, reps: 4 },
        { percentage: 0.80, reps: 2 },
      ],
    });

    assert.equal(ramp.length, 4);
    assert.equal(ramp[0].displayWeight, 20);
    assert.equal(ramp[0].reps, 10);
    assert.equal(ramp[1].displayWeight, 40);
    assert.equal(ramp[1].reps, 8);
    assert.equal(ramp[2].displayWeight, 60);
    assert.equal(ramp[2].reps, 4);
    assert.equal(ramp[3].displayWeight, 80);
    assert.equal(ramp[3].reps, 2);
  });

  it('supports step exclusion and customized reps filtering', () => {
    const ramp = generateWarmupRamp({
      workingWeightKg: 100,
      barWeightKg: 20,
      unit: 'kg',
      preset: 'strength',
    });

    // Say user excludes step 1 (setIndex 1, the empty bar)
    const excluded = new Set([1]);
    const customReps: Record<number, number> = { 2: 6, 3: 4 };

    const applied = ramp
      .filter((s) => !excluded.has(s.setIndex))
      .map((s) => ({
        weightKg: s.weightKg,
        reps: customReps[s.setIndex] ?? s.reps,
      }));

    assert.equal(applied.length, 3);
    assert.equal(applied[0].weightKg, 50);
    assert.equal(applied[0].reps, 6); // customized from 5 to 6
    assert.equal(applied[1].weightKg, 70);
    assert.equal(applied[1].reps, 4); // customized from 3 to 4
    assert.equal(applied[2].weightKg, 85);
    assert.equal(applied[2].reps, 1); // unedited default
  });

  it('correctly toggles warmup exclusion in Set', () => {
    let excluded = new Set<number>();

    // Helper simulating toggleIncludeStep
    const toggle = (idx: number) => {
      const next = new Set(excluded);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      excluded = next;
    };

    // Initially not excluded
    assert.equal(excluded.has(1), false);

    // Toggle once -> excluded
    toggle(1);
    assert.equal(excluded.has(1), true);

    // Toggle second time -> unexcluded
    toggle(1);
    assert.equal(excluded.has(1), false);
  });

  it('preserves already completed warmup sets when replacing warmups', () => {
    const existingSets = [
      { id: 'w1', setNumber: 1, type: 'warmup' as const, weightKg: 20, reps: 10, isCompleted: true },
      { id: 'w2', setNumber: 2, type: 'warmup' as const, weightKg: 50, reps: 5, isCompleted: false }, // not completed
      { id: 'work1', setNumber: 3, type: 'normal' as const, weightKg: 100, reps: 5, isCompleted: false },
    ];

    const completedWarmups = existingSets.filter((s) => s.type === 'warmup' && s.isCompleted);
    const nonWarmups = existingSets.filter((s) => s.type !== 'warmup');

    const newWarmups = [
      { id: 'new-w2', setNumber: 1, type: 'warmup' as const, weightKg: 60, reps: 4, isCompleted: false },
      { id: 'new-w3', setNumber: 2, type: 'warmup' as const, weightKg: 80, reps: 2, isCompleted: false },
    ];

    const combined = [...completedWarmups, ...newWarmups, ...nonWarmups].map((s, idx) => ({
      ...s,
      setNumber: idx + 1,
    }));

    // Should have 1 completed warmup + 2 new warmups + 1 working set = 4 sets
    assert.equal(combined.length, 4);
    assert.equal(combined[0].id, 'w1');
    assert.equal(combined[0].isCompleted, true);
    assert.equal(combined[0].setNumber, 1);

    assert.equal(combined[1].id, 'new-w2');
    assert.equal(combined[1].weightKg, 60);
    assert.equal(combined[1].setNumber, 2);

    assert.equal(combined[2].id, 'new-w3');
    assert.equal(combined[2].weightKg, 80);
    assert.equal(combined[2].setNumber, 3);

    assert.equal(combined[3].id, 'work1');
    assert.equal(combined[3].setNumber, 4);
  });
});

describe('Barbell Sleeve Visual & Plate Color Specs', () => {
  const { getPlateVisualSpec } = require('../../src/workout/barbell');

  it('returns correct Olympic color-coded specs for KG plates', () => {
    const red25 = getPlateVisualSpec(25, 'kg');
    assert.equal(red25.backgroundColor, '#DC2626');
    assert.equal(red25.label, '25');

    const blue20 = getPlateVisualSpec(20, 'kg');
    assert.equal(blue20.backgroundColor, '#2563EB');
    assert.equal(blue20.label, '20');

    const yellow15 = getPlateVisualSpec(15, 'kg');
    assert.equal(yellow15.backgroundColor, '#EAB308');
    assert.equal(yellow15.label, '15');

    const green10 = getPlateVisualSpec(10, 'kg');
    assert.equal(green10.backgroundColor, '#16A34A');
    assert.equal(green10.label, '10');

    const white5 = getPlateVisualSpec(5, 'kg');
    assert.equal(white5.backgroundColor, '#F3F4F6');
    assert.equal(white5.label, '5');

    const black2_5 = getPlateVisualSpec(2.5, 'kg');
    assert.equal(black2_5.backgroundColor, '#1F2937');

    const silver1_25 = getPlateVisualSpec(1.25, 'kg');
    assert.equal(silver1_25.backgroundColor, '#94A3B8');
  });

  it('returns correct Olympic color-coded specs for LB plates', () => {
    const red55 = getPlateVisualSpec(55, 'lb');
    assert.equal(red55.backgroundColor, '#DC2626');

    const blue45 = getPlateVisualSpec(45, 'lb');
    assert.equal(blue45.backgroundColor, '#2563EB');

    const yellow35 = getPlateVisualSpec(35, 'lb');
    assert.equal(yellow35.backgroundColor, '#EAB308');

    const green25 = getPlateVisualSpec(25, 'lb');
    assert.equal(green25.backgroundColor, '#16A34A');

    const black10 = getPlateVisualSpec(10, 'lb');
    assert.equal(black10.backgroundColor, '#1F2937');

    const white5 = getPlateVisualSpec(5, 'lb');
    assert.equal(white5.backgroundColor, '#F3F4F6');
  });
});
