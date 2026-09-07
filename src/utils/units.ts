export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.453592;

export function kgToDisplay(weightKg: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return Math.round((weightKg / KG_PER_LB) * 10) / 10;
  }
  return weightKg;
}

export function displayToKg(displayValue: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return Math.round(displayValue * KG_PER_LB * 100) / 100;
  }
  return displayValue;
}

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  const display = kgToDisplay(weightKg, unit);
  const trimmed = Number.isInteger(display) ? display.toString() : display.toFixed(1).replace(/\.0$/, '');
  return `${trimmed} ${unit}`;
}
