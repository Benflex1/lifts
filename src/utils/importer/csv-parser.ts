import { Exercise, SetType } from '../../types';
import { parseDurationSeconds, parseWorkoutDate } from './date-parser';
import { detectTrackerFormat, normalizeHeader } from './detector';
import { ExerciseMapper } from './exercise-mapper';
import { tokenizeCsv } from './tokenizer';
import {
  CsvImportOptions,
  DetectedTrackerFormat,
  ParsedExerciseGroup,
  ParsedSet,
  ParsedWorkoutSession,
  RawCsvSetRow,
} from './types';

const LB_TO_KG = 0.45359237;

export function normalizeSetType(rawType?: string, notes?: string): SetType {
  const typeStr = (rawType || '').toLowerCase().trim();
  if (typeStr === 'warmup' || typeStr === 'warm up' || typeStr === 'w') return 'warmup';
  if (typeStr === 'dropset' || typeStr === 'drop set' || typeStr === 'drop' || typeStr === 'd') return 'drop';
  if (typeStr === 'failure' || typeStr === 'f') return 'failure';

  if (notes) {
    const notesLower = notes.toLowerCase().trim();
    if (/\b(warmup|warm up)\b/.test(notesLower)) return 'warmup';
    if (/\b(drop set|dropset)\b/.test(notesLower)) return 'drop';
    if (/\b(to failure|till failure|until failure|failure set)\b/.test(notesLower)) return 'failure';
  }
  return 'normal';
}

export function parseWeightToKg(
  rawWeight?: string,
  unit?: string,
  fallbackUnit: 'kg' | 'lb' = 'kg'
): number {
  if (!rawWeight || !rawWeight.trim()) return 0;
  // Handle European comma decimal: "102,5" -> "102.5"
  const clean = rawWeight.trim().replace(',', '.');
  const num = parseFloat(clean);
  if (Number.isNaN(num) || num < 0) return 0;

  const isLb = (unit && /lb/i.test(unit)) || (!unit && fallbackUnit === 'lb');
  const kg = isLb ? num * LB_TO_KG : num;
  return Math.round(kg * 100) / 100;
}

export function parseReps(rawReps?: string): number {
  if (!rawReps || !rawReps.trim()) return 0;
  const num = parseInt(rawReps.trim(), 10);
  return Number.isNaN(num) || num < 0 ? 0 : num;
}

const METERS_PER_UNIT: Record<string, number> = {
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  kilometre: 1000,
  kilometres: 1000,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  ft: 0.3048,
  feet: 0.3048,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144,
};

/** Parses a set distance into metres. Unknown or missing units fall back to km (kg users) or miles. */
export function parseDistanceToMeters(
  rawDistance?: string,
  unit?: string,
  fallbackUnit: 'kg' | 'lb' = 'kg'
): number | undefined {
  if (!rawDistance || !rawDistance.trim()) return undefined;
  const num = parseFloat(rawDistance.trim().replace(',', '.'));
  if (Number.isNaN(num) || num <= 0) return undefined;
  const factor = METERS_PER_UNIT[(unit || '').trim().toLowerCase()] ?? (fallbackUnit === 'lb' ? 1609.344 : 1000);
  return Math.round(num * factor * 10) / 10;
}

/** Parses a set time: plain seconds ("90") or a clock ("1:30", "0:01:30"). */
export function parseSetSeconds(rawTime?: string): number | undefined {
  if (!rawTime || !rawTime.trim()) return undefined;
  const clean = rawTime.trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const seconds = Math.round(parseFloat(clean));
    return seconds > 0 ? seconds : undefined;
  }
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(clean)) {
    const seconds = Math.round(clean.split(':').reduce((total, part) => total * 60 + parseFloat(part), 0));
    return seconds > 0 ? seconds : undefined;
  }
  return undefined;
}

export function parseRpe(rawRpe?: string): number | undefined {
  if (!rawRpe || !rawRpe.trim()) return undefined;
  const num = parseFloat(rawRpe.trim().replace(',', '.'));
  if (Number.isNaN(num) || num < 1 || num > 10) return undefined;
  return Math.round(num * 10) / 10;
}

interface ColumnIndices {
  workoutName: number;
  date: number;
  startTime: number;
  endTime: number;
  duration: number;
  durationUnit?: 'seconds' | 'minutes' | 'auto';
  exerciseName: number;
  category: number;
  setIndex: number;
  setType: number;
  weight: number;
  weightUnit: number;
  headerWeightUnit?: 'kg' | 'lb';
  reps: number;
  rpe: number;
  setSeconds: number;
  distance: number;
  distanceUnit: number;
  headerDistanceUnit?: string;
  exerciseNotes: number;
  workoutNotes: number;
}

// Per-set time columns: Strong's "Seconds", Hevy's "duration_seconds" and FitNotes' "Time".
function isSetTimeHeader(h: string, format: DetectedTrackerFormat): boolean {
  if (h === 'seconds') return true;
  if (format === 'hevy' && h === 'duration seconds') return true;
  if (format === 'fitnotes' && h === 'time') return true;
  return false;
}

function resolveColumnIndices(headerRow: string[], format: DetectedTrackerFormat): ColumnIndices {
  const norm = headerRow.map(normalizeHeader);

  const indices: ColumnIndices = {
    workoutName: -1,
    date: -1,
    startTime: -1,
    endTime: -1,
    duration: -1,
    exerciseName: -1,
    category: -1,
    setIndex: -1,
    setType: -1,
    weight: -1,
    weightUnit: -1,
    reps: -1,
    rpe: -1,
    setSeconds: -1,
    distance: -1,
    distanceUnit: -1,
    exerciseNotes: -1,
    workoutNotes: -1,
  };

  norm.forEach((h, idx) => {
    // Workout Title / Name
    if (indices.workoutName === -1 && (h === 'workout name' || h === 'workout' || h === 'title' || h === 'routine name')) {
      indices.workoutName = idx;
    }
    // Date / Start Time
    if (h === 'start time' || h === 'starttime') {
      indices.startTime = idx;
      if (indices.date === -1) indices.date = idx;
    } else if (indices.date === -1 && (h === 'date' || h === 'workout date' || h === 'mydate')) {
      indices.date = idx;
    }
    // End Time
    if (h === 'end time' || h === 'endtime') {
      indices.endTime = idx;
    }
    // Set time and distance
    if (isSetTimeHeader(h, format)) {
      if (indices.setSeconds === -1) indices.setSeconds = idx;
    } else if (indices.distance === -1 && (h === 'distance' || h.startsWith('distance ') || h.startsWith('distance('))) {
      if (h === 'distance unit') {
        indices.distanceUnit = idx;
      } else {
        indices.distance = idx;
        const unitMatch = h.match(/^distance\s*\(?\s*(km|kilometers|m|meters|mi|miles|ft|feet|yd|yards)\s*\)?$/);
        if (unitMatch) indices.headerDistanceUnit = unitMatch[1];
      }
    } else if (h === 'distance unit') {
      indices.distanceUnit = idx;
    }
    // Duration
    if (
      indices.duration === -1 &&
      !isSetTimeHeader(h, format) &&
      (h.includes('duration') || h === 'workout duration' || h === 'total time' || h === 'time')
    ) {
      indices.duration = idx;
      if (h.includes('second') || h === 'duration_seconds' || h.endsWith('_s')) {
        indices.durationUnit = 'seconds';
      } else if (h.includes('minute') || h === 'duration_minutes' || h.endsWith('_m')) {
        indices.durationUnit = 'minutes';
      }
    }
    // Exercise Name
    if (indices.exerciseName === -1 && (h === 'exercise title' || h === 'exercise name' || h === 'exercise' || h === 'ename' || h === 'movement')) {
      indices.exerciseName = idx;
    }
    // Category
    if (indices.category === -1 && h === 'category') {
      indices.category = idx;
    }
    // Set Order / Index
    if (indices.setIndex === -1 && (h === 'set order' || h === 'set index' || h === 'set' || h === 'set number')) {
      indices.setIndex = idx;
    }
    // Set Type
    if (indices.setType === -1 && (h === 'set type' || h === 'kind' || h === 'type')) {
      indices.setType = idx;
    }
    // Weight & Weight Unit
    if (h === 'weight kg' || h === 'weight (kg)' || h === 'weight(kg)' || h === 'kg') {
      indices.weight = idx;
      indices.headerWeightUnit = 'kg';
    } else if (h === 'weight lbs' || h === 'weight (lbs)' || h === 'weight(lbs)' || h === 'weight lb' || h === 'lbs') {
      indices.weight = idx;
      indices.headerWeightUnit = 'lb';
    } else if (indices.weight === -1 && (h === 'weight' || h === 'load')) {
      indices.weight = idx;
    }
    if (indices.weightUnit === -1 && (h === 'weight unit' || h === 'unit')) {
      indices.weightUnit = idx;
    }
    // Reps
    if (indices.reps === -1 && (h === 'reps' || h === 'repetitions' || h === 'repetition' || h === 'rep')) {
      indices.reps = idx;
    }
    // RPE
    if (indices.rpe === -1 && (h === 'rpe' || h === 'intensity')) {
      indices.rpe = idx;
    }
    // Notes
    if (h === 'exercise notes' || (indices.exerciseNotes === -1 && (h === 'notes' || h === 'comment'))) {
      indices.exerciseNotes = idx;
    }
    if (h === 'workout notes' || h === 'description' || (indices.workoutNotes === -1 && h === 'workout note')) {
      indices.workoutNotes = idx;
    }
  });

  return indices;
}

export function parseWorkoutCsv(
  csvText: string,
  existingExercises: Exercise[] = [],
  options?: Partial<CsvImportOptions>
): {
  sessions: ParsedWorkoutSession[];
  detectedFormat: DetectedTrackerFormat;
  formatLabel: string;
  mapper: ExerciseMapper;
  warnings: string[];
} {
  const rows = tokenizeCsv(csvText);
  if (rows.length < 2) {
    throw new Error('CSV file is empty or missing data rows');
  }

  const headerRow = rows[0];
  const { format: detectedFormat, label: formatLabel } = detectTrackerFormat(headerRow);
  const indices = resolveColumnIndices(headerRow, detectedFormat);
  const warnings: string[] = [];

  if (indices.exerciseName === -1) {
    throw new Error('Could not find an Exercise Name column in CSV');
  }

  const mapper = new ExerciseMapper(existingExercises, options?.exerciseOverrides);
  const defaultUnit = options?.defaultUnit || 'kg';

  // Group rows by workout key: workoutName + dateStr
  interface GroupedWorkout {
    key: string;
    workoutName: string;
    dateStr: string;
    startTimeStr?: string;
    endTimeStr?: string;
    durationStr?: string;
    workoutNotes?: string;
    rows: Array<{
      exerciseName: string;
      category?: string;
      setIndex?: number;
      setType?: string;
      weightStr?: string;
      weightUnit?: string;
      repsStr?: string;
      rpeStr?: string;
      secondsStr?: string;
      distanceStr?: string;
      distanceUnit?: string;
      exerciseNotes?: string;
    }>;
  }

  const workoutMap = new Map<string, GroupedWorkout>();
  const workoutOrder: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip empty lines
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const getCol = (idx: number) => (idx >= 0 && idx < row.length ? row[idx].trim() : '');

    const exerciseName = getCol(indices.exerciseName);
    if (!exerciseName) continue; // skip row if no exercise

    let dateStr = getCol(indices.startTime) || getCol(indices.date);
    let workoutName = getCol(indices.workoutName);

    if (!dateStr) {
      dateStr = new Date().toISOString();
    }
    if (!workoutName) {
      workoutName = `Workout ${dateStr.slice(0, 10)}`;
    }

    // Workout key combines date and name
    const workoutKey = `${dateStr}_${workoutName}`;
    let workoutGroup = workoutMap.get(workoutKey);
    if (!workoutGroup) {
      workoutGroup = {
        key: workoutKey,
        workoutName,
        dateStr,
        startTimeStr: getCol(indices.startTime) || dateStr,
        endTimeStr: getCol(indices.endTime) || undefined,
        durationStr: getCol(indices.duration) || undefined,
        workoutNotes: getCol(indices.workoutNotes) || undefined,
        rows: [],
      };
      workoutMap.set(workoutKey, workoutGroup);
      workoutOrder.push(workoutKey);
    }

    const weightUnit =
      indices.headerWeightUnit ||
      getCol(indices.weightUnit) ||
      defaultUnit;

    workoutGroup.rows.push({
      exerciseName,
      category: getCol(indices.category) || undefined,
      setIndex: indices.setIndex >= 0 ? parseInt(getCol(indices.setIndex), 10) : undefined,
      setType: getCol(indices.setType) || undefined,
      weightStr: getCol(indices.weight) || '0',
      weightUnit,
      repsStr: getCol(indices.reps) || '0',
      rpeStr: getCol(indices.rpe) || undefined,
      secondsStr: getCol(indices.setSeconds) || undefined,
      distanceStr: getCol(indices.distance) || undefined,
      distanceUnit: indices.headerDistanceUnit || getCol(indices.distanceUnit) || undefined,
      exerciseNotes: getCol(indices.exerciseNotes) || undefined,
    });
  }

  // Convert each grouped workout into ParsedWorkoutSession
  const sessions: ParsedWorkoutSession[] = [];

  for (const key of workoutOrder) {
    const group = workoutMap.get(key)!;
    const startTimeIso = parseWorkoutDate(group.startTimeStr || group.dateStr);
    const durationSeconds = parseDurationSeconds(group.durationStr, indices.durationUnit);

    let endTimeIso: string | undefined;
    if (group.endTimeStr) {
      endTimeIso = parseWorkoutDate(group.endTimeStr);
    } else {
      const endTimestamp = Date.parse(startTimeIso) + durationSeconds * 1000;
      endTimeIso = new Date(endTimestamp).toISOString();
    }

    // Group rows into consecutive exercise groups
    const exerciseGroups: ParsedExerciseGroup[] = [];
    let currentExerciseGroup: ParsedExerciseGroup | null = null;

    for (let i = 0; i < group.rows.length; i++) {
      const r = group.rows[i];
      mapper.recordUsage(r.exerciseName, key);
      const { exercise: matchedEx } = mapper.getOrCreateExercise(r.exerciseName, r.category);

      const setSeconds = parseSetSeconds(r.secondsStr);
      const distanceM = parseDistanceToMeters(r.distanceStr, r.distanceUnit, defaultUnit);
      const parsedSet: ParsedSet = {
        setNumber: r.setIndex || (currentExerciseGroup ? currentExerciseGroup.sets.length + 1 : 1),
        type: normalizeSetType(r.setType, r.exerciseNotes),
        weightKg: parseWeightToKg(r.weightStr, r.weightUnit, defaultUnit),
        reps: parseReps(r.repsStr),
        ...(setSeconds !== undefined ? { durationSeconds: setSeconds } : {}),
        ...(distanceM !== undefined ? { distanceM } : {}),
        rpe: parseRpe(r.rpeStr),
        isCompleted: true,
        notes: r.exerciseNotes,
      };

      // Check if we should append to current group or start a new group
      // Same exercise and consecutive row -> append
      if (currentExerciseGroup && currentExerciseGroup.matchedExercise.id === matchedEx.id) {
        // Adjust set number if needed
        if (!r.setIndex) {
          parsedSet.setNumber = currentExerciseGroup.sets.length + 1;
        }
        currentExerciseGroup.sets.push(parsedSet);
        if (r.exerciseNotes && !currentExerciseGroup.notes) {
          currentExerciseGroup.notes = r.exerciseNotes;
        }
      } else {
        currentExerciseGroup = {
          rawName: r.exerciseName,
          matchedExercise: matchedEx,
          notes: r.exerciseNotes,
          sets: [parsedSet],
        };
        exerciseGroups.push(currentExerciseGroup);
      }
    }

    sessions.push({
      name: group.workoutName,
      startTime: startTimeIso,
      endTime: endTimeIso,
      durationSeconds,
      notes: group.workoutNotes,
      exerciseGroups,
    });
  }

  return {
    sessions,
    detectedFormat,
    formatLabel,
    mapper,
    warnings,
  };
}
