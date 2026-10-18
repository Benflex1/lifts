/**
 * Body weight log: one weigh-in per day, kept as one JSON setting so it travels with backups
 * without a schema change. It is off by default and lives on the Progress tab.
 */
export const BODY_WEIGHT_ENABLED_KEY = 'body_weight_enabled';
export const BODY_WEIGHT_LOG_KEY = 'body_weight_log';

// Weigh-ins outside this range are typos (82 typed as 820), so they are refused.
export const MIN_BODY_WEIGHT_KG = 20;
export const MAX_BODY_WEIGHT_KG = 400;

export interface BodyWeightEntry {
  /** Local calendar day, YYYY-MM-DD. A second weigh-in on the same day replaces the first. */
  date: string;
  weightKg: number;
}

export type BodyWeightRange = '1M' | '3M' | '1Y' | 'ALL';

const RANGE_DAYS: Record<Exclude<BodyWeightRange, 'ALL'>, number> = {
  '1M': 30,
  '3M': 91,
  '1Y': 365,
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function parseBodyWeightEnabled(value: string | null): boolean {
  return value === 'true';
}

export function isValidBodyWeightKg(weightKg: number): boolean {
  return (
    Number.isFinite(weightKg) && weightKg >= MIN_BODY_WEIGHT_KG && weightKg <= MAX_BODY_WEIGHT_KG
  );
}

/** The local calendar day of a date, so a late-evening weigh-in never lands on tomorrow. */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Noon on that local day, so day arithmetic never trips over daylight saving changes. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(part => parseInt(part, 10));
  return new Date(year, month - 1, day, 12);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((fromDateKey(toKey).getTime() - fromDateKey(fromKey).getTime()) / 86_400_000);
}

function sortByDate(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

/** Reads the stored log oldest first, dropping malformed entries instead of failing. */
export function parseBodyWeightLog(value: string | null | undefined): BodyWeightEntry[] {
  if (!value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, BodyWeightEntry>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { date, weightKg } = item as Record<string, unknown>;
    // A real calendar day: 2026-02-31 would roll over to March.
    if (typeof date !== 'string' || !DATE_KEY.test(date) || toDateKey(fromDateKey(date)) !== date)
      continue;
    if (typeof weightKg !== 'number' || !isValidBodyWeightKg(weightKg)) continue;
    byDate.set(date, { date, weightKg });
  }
  return sortByDate(Array.from(byDate.values()));
}

export function serializeBodyWeightLog(entries: BodyWeightEntry[]): string {
  return JSON.stringify(sortByDate(entries).map(({ date, weightKg }) => ({ date, weightKg })));
}

export function upsertBodyWeight(
  entries: BodyWeightEntry[],
  date: string,
  weightKg: number,
): BodyWeightEntry[] {
  return sortByDate([...entries.filter(entry => entry.date !== date), { date, weightKg }]);
}

export function removeBodyWeight(entries: BodyWeightEntry[], date: string): BodyWeightEntry[] {
  return entries.filter(entry => entry.date !== date);
}

/** Restores add the backup's weigh-ins; on a day both have, this device's wins. */
export function mergeBodyWeightLogs(existing: string | undefined, incoming: string): string {
  const byDate = new Map<string, BodyWeightEntry>();
  for (const entry of parseBodyWeightLog(incoming)) byDate.set(entry.date, entry);
  for (const entry of parseBodyWeightLog(existing)) byDate.set(entry.date, entry);
  return serializeBodyWeightLog(Array.from(byDate.values()));
}

/** Weigh-ins inside a range, counted back from today. */
export function filterBodyWeightRange(
  entries: BodyWeightEntry[],
  range: BodyWeightRange,
  now: Date = new Date(),
): BodyWeightEntry[] {
  if (range === 'ALL') return entries;
  const today = toDateKey(now);
  return entries.filter(entry => {
    const age = daysBetween(entry.date, today);
    return age >= 0 && age <= RANGE_DAYS[range];
  });
}

export interface BodyWeightSummary {
  latest: BodyWeightEntry;
  /** Change from the weigh-in about 30 days before the latest, or the first one if the log is younger. */
  change?: { kg: number; days: number };
  /** Average of the weigh-ins in the 7 days up to the latest, which smooths out water and food swings. */
  weekAverageKg: number;
  lowestKg: number;
  highestKg: number;
}

export function summarizeBodyWeight(entries: BodyWeightEntry[]): BodyWeightSummary | null {
  if (entries.length === 0) return null;
  const latest = entries[entries.length - 1];
  // The newest weigh-in at least 30 days older than the latest, else the oldest one.
  let base: BodyWeightEntry | undefined;
  for (const entry of entries) {
    if (daysBetween(entry.date, latest.date) >= 30) base = entry;
  }
  base = base ?? entries[0];
  const baseDays = daysBetween(base.date, latest.date);
  const week = entries.filter(entry => daysBetween(entry.date, latest.date) <= 6);
  const weights = entries.map(entry => entry.weightKg);
  return {
    latest,
    ...(baseDays > 0
      ? {
          change: { kg: Math.round((latest.weightKg - base.weightKg) * 100) / 100, days: baseDays },
        }
      : {}),
    weekAverageKg:
      Math.round((week.reduce((sum, entry) => sum + entry.weightKg, 0) / week.length) * 100) / 100,
    lowestKg: Math.min(...weights),
    highestKg: Math.max(...weights),
  };
}

/**
 * The trend line: each weigh-in averaged with the others from the 7 days up to it, so daily water
 * and food swings don't hide the direction.
 */
export function bodyWeightTrend(
  entries: BodyWeightEntry[],
  windowDays: number = 7,
): BodyWeightEntry[] {
  return entries.map((entry, index) => {
    let sum = 0;
    let count = 0;
    for (let i = index; i >= 0 && daysBetween(entries[i].date, entry.date) < windowDays; i--) {
      sum += entries[i].weightKg;
      count += 1;
    }
    return { date: entry.date, weightKg: Math.round((sum / count) * 100) / 100 };
  });
}

/** "Today", "Yesterday", "Mon 6 Oct" for a log row, with the year once it is not this year. */
export function formatWeighInDate(key: string, now: Date = new Date()): string {
  const age = daysBetween(key, toDateKey(now));
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  const date = fromDateKey(key);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${weekday} ${date.getDate()} ${month}${year}`;
}
