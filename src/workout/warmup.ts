import { WeightUnit, kgToDisplay, displayToKg } from '../utils/units';
import { calculatePlates, LB_PLATES, KG_PLATES } from '../utils/calculator';
import { PlateCalculation } from '../types';

export type WarmupPreset = 'strength' | 'hypertrophy' | 'quick' | 'heavy' | 'custom';

export interface WarmupStepRatio {
  percentage: number; // 0 to 1 (e.g. 0.5 for 50%)
  reps: number;
  useBarIfAvailable?: boolean; // if true, uses empty bar if bar weight > 0
}

export interface WarmupPresetConfig {
  id: WarmupPreset;
  name: string;
  description: string;
  steps: WarmupStepRatio[];
}

export const WARMUP_PRESETS: Record<WarmupPreset, WarmupPresetConfig> = {
  strength: {
    id: 'strength',
    name: 'Standard Strength',
    description: '4-step ramp optimal for compound strength lifts (Bar, 50%, 70%, 85%)',
    steps: [
      { percentage: 0, reps: 10, useBarIfAvailable: true },
      { percentage: 0.50, reps: 5 },
      { percentage: 0.70, reps: 3 },
      { percentage: 0.85, reps: 1 },
    ],
  },
  hypertrophy: {
    id: 'hypertrophy',
    name: 'Hypertrophy / Moderate',
    description: '3-step ramp to prepare joints and prime target muscles (Bar, 60%, 80%)',
    steps: [
      { percentage: 0, reps: 10, useBarIfAvailable: true },
      { percentage: 0.60, reps: 6 },
      { percentage: 0.80, reps: 3 },
    ],
  },
  quick: {
    id: 'quick',
    name: 'Quick / Express',
    description: '2-step fast warmup for time-crunched workouts (50%, 75%)',
    steps: [
      { percentage: 0.50, reps: 5 },
      { percentage: 0.75, reps: 3 },
    ],
  },
  heavy: {
    id: 'heavy',
    name: 'Heavy / Powerlifting',
    description: '5-step gradual ramp for heavy singles and peak PR attempts (Bar, 50%, 65%, 80%, 90%)',
    steps: [
      { percentage: 0, reps: 10, useBarIfAvailable: true },
      { percentage: 0.50, reps: 5 },
      { percentage: 0.65, reps: 3 },
      { percentage: 0.80, reps: 2 },
      { percentage: 0.90, reps: 1 },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Custom Ramp',
    description: 'User-specified ramp percentages and rep ranges',
    steps: [],
  },
};

export interface WarmupOptions {
  workingWeightKg: number;
  barWeightKg?: number; // default: 20 kg (or 45 lb converted) for barbell, 0 for dumbbells/cables
  unit: WeightUnit;
  preset: WarmupPreset;
  customSteps?: WarmupStepRatio[];
  roundIncrement?: number; // in display units: 2.5 kg (kg) or 5 lb (lb)
}

export interface GeneratedWarmupSet {
  setIndex: number;
  weightKg: number;
  displayWeight: number;
  reps: number;
  percentage: number;
  label: string;
  plates?: PlateCalculation;
}

/**
 * Rounds a numeric weight to the nearest valid plate increment (e.g. 2.5 kg or 5 lb).
 */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return Math.round(value * 100) / 100;
  const factor = 1 / increment;
  return Math.round(value * factor) / factor;
}

/**
 * Returns the default bar weight in display units based on unit and equipment.
 */
export function getDefaultBarWeight(
  equipment?: string,
  category?: string,
  unit: WeightUnit = 'kg'
): number {
  const equipLower = (equipment || '').toLowerCase();
  const catLower = (category || '').toLowerCase();

  // If dumbbell, machine, cable, bodyweight, or kettlebell -> 0 bar weight
  if (
    equipLower.includes('dumbbell') ||
    equipLower.includes('cable') ||
    equipLower.includes('machine') ||
    equipLower.includes('bodyweight') ||
    equipLower.includes('kettlebell') ||
    catLower.includes('dumbbell') ||
    catLower.includes('cable') ||
    catLower.includes('machine') ||
    catLower.includes('bodyweight')
  ) {
    return 0;
  }

  // Barbell default: 20 kg or 45 lb
  return unit === 'lb' ? 45 : 20;
}

/**
 * Returns default plate rounding increment for the given unit.
 * In kg: 2.5 kg (1.25 kg each side)
 * In lb: 5 lb (2.5 lb each side)
 */
export function getDefaultIncrement(unit: WeightUnit): number {
  return unit === 'lb' ? 5 : 2.5;
}

/**
 * Generates an array of calculated warmup sets based on working weight, preset, and rounding rules.
 */
export function generateWarmupRamp(options: WarmupOptions): GeneratedWarmupSet[] {
  const {
    workingWeightKg,
    unit,
    preset,
    customSteps,
  } = options;

  const defaultInc = getDefaultIncrement(unit);
  const increment = options.roundIncrement && options.roundIncrement > 0 ? options.roundIncrement : defaultInc;

  const workingDisplayWeight = kgToDisplay(workingWeightKg, unit);

  // If barWeightKg is provided, convert to display units; otherwise use default for barbell
  const barDisplayWeight =
    options.barWeightKg !== undefined
      ? kgToDisplay(options.barWeightKg, unit)
      : unit === 'lb'
      ? 45
      : 20;

  const config = preset === 'custom' && customSteps && customSteps.length > 0
    ? { steps: customSteps }
    : WARMUP_PRESETS[preset] || WARMUP_PRESETS.strength;

  if (workingDisplayWeight <= 0) {
    return [];
  }

  const generated: GeneratedWarmupSet[] = [];
  const seenWeights = new Set<number>();

  for (let i = 0; i < config.steps.length; i++) {
    const step = config.steps[i];
    let stepDisplayWeight: number;

    if (step.useBarIfAvailable) {
      if (barDisplayWeight > 0) {
        stepDisplayWeight = barDisplayWeight;
      } else if (step.percentage === 0) {
        // Skip empty bar step if exercise has no bar (e.g. dumbbell, cable, machine)
        continue;
      } else {
        stepDisplayWeight = roundToIncrement(step.percentage * workingDisplayWeight, increment);
      }
    } else {
      const raw = step.percentage * workingDisplayWeight;
      stepDisplayWeight = roundToIncrement(raw, increment);

      // Floor at bar weight if a bar exists
      if (barDisplayWeight > 0 && stepDisplayWeight < barDisplayWeight) {
        stepDisplayWeight = barDisplayWeight;
      }
    }

    if (stepDisplayWeight <= 0) {
      continue;
    }

    // Warmup sets must not exceed the target working weight
    if (workingDisplayWeight > barDisplayWeight) {
      stepDisplayWeight = Math.min(stepDisplayWeight, workingDisplayWeight);
    }

    // Deduplicate identical weights (e.g. when working weight is light and multiple steps clamp to bar)
    if (seenWeights.has(stepDisplayWeight)) {
      continue;
    }

    // Don't add a warmup set that equals the working weight (unless it's the only step generated)
    if (stepDisplayWeight >= workingDisplayWeight && generated.length > 0) {
      continue;
    }

    seenWeights.add(stepDisplayWeight);

    const stepKg = displayToKg(stepDisplayWeight, unit);

    let plateCalc: PlateCalculation | undefined;
    if (barDisplayWeight > 0 && stepDisplayWeight >= barDisplayWeight) {
      plateCalc = calculatePlates(
        stepDisplayWeight,
        barDisplayWeight,
        unit === 'lb' ? LB_PLATES : KG_PLATES
      );
    }

    const pctLabel =
      step.useBarIfAvailable && stepDisplayWeight === barDisplayWeight && barDisplayWeight > 0
        ? 'Bar'
        : `${Math.round((stepDisplayWeight / workingDisplayWeight) * 100)}%`;

    generated.push({
      setIndex: generated.length + 1,
      weightKg: stepKg,
      displayWeight: stepDisplayWeight,
      reps: step.reps,
      percentage: Math.round((stepDisplayWeight / workingDisplayWeight) * 100),
      label: pctLabel,
      plates: plateCalc,
    });
  }

  return generated;
}

/**
 * Formats plate calculation summary for display (e.g. "20kg, 10kg/side" or "Empty Bar").
 */
export function formatPlateBreakdown(calc?: PlateCalculation, unit: WeightUnit = 'kg'): string {
  if (!calc) return '';
  if (calc.targetWeight <= calc.barWeight) {
    return 'Empty Bar';
  }
  if (!calc.plates || calc.plates.length === 0) {
    return 'Empty Bar';
  }

  const parts = calc.plates.map((p) => (p.count > 1 ? `${p.count}×${p.weight}` : `${p.weight}`));
  return `${parts.join(', ')} / side`;
}
