import { PlateCalculation } from '../types';

export const LB_PLATES = [45, 25, 10, 5, 2.5];
export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

export function calculatePlates(
  targetWeight: number,
  barWeight: number = 20,
  availablePlates: number[] = KG_PLATES
): PlateCalculation {
  if (targetWeight <= barWeight) {
    return {
      barWeight,
      targetWeight,
      weightPerSide: 0,
      plates: [],
      remainder: 0,
    };
  }

  const weightNeeded = targetWeight - barWeight;
  let perSide = weightNeeded / 2;
  const sortedPlates = [...availablePlates].sort((a, b) => b - a);
  const resultPlates: { weight: number; count: number }[] = [];

  for (const plate of sortedPlates) {
    if (perSide >= plate) {
      const count = Math.floor(perSide / plate);
      resultPlates.push({ weight: plate, count });
      perSide = Number((perSide - count * plate).toFixed(2));
    }
  }

  return {
    barWeight,
    targetWeight,
    weightPerSide: (targetWeight - barWeight) / 2,
    plates: resultPlates,
    remainder: perSide * 2,
  };
}

export function calculate1RM(weight: number, reps: number): { epley: number; brzycki: number; average: number } {
  if (reps <= 1) {
    return { epley: weight, brzycki: weight, average: weight };
  }

  const epley = weight * (1 + reps / 30);
  const brzycki = reps < 37 ? weight * (36 / (37 - reps)) : epley;
  const average = Math.round((epley + brzycki) / 2);

  return {
    epley: Math.round(epley),
    brzycki: Math.round(brzycki),
    average,
  };
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
