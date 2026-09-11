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
  const combined = `${rawType || ''} ${notes || ''}`.toLowerCase().trim();
  if (combined.includes('warmup') || combined.includes('warm up') || combined === 'w') {
    return 'warmup';
  }
  if (combined.includes('dropset') || combined.includes('drop set') || combined.includes('drop') || combined === 'd') {
    return 'drop';
  }
  if (combined.includes('failure') || combined === 'f') {
    return 'failure';
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
  exerciseName: number;
  category: number;
  setIndex: number;
  setType: number;
  weight: number;
  weightUnit: number;
  headerWeightUnit?: 'kg' | 'lb';
  reps: number;
  rpe: number;
  exerciseNotes: number;
  workoutNotes: number;
}

function resolveColumnIndices(headerRow: string[]): ColumnIndices {
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
    // Duration
    if (indices.duration === -1 && (h.includes('duration') || h === 'workout duration' || h === 'total time' || h === 'time')) {
      indices.duration = idx;
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
  const indices = resolveColumnIndices(headerRow);
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
      exerciseNotes: getCol(indices.exerciseNotes) || undefined,
    });
  }

  // Convert each grouped workout into ParsedWorkoutSession
  const sessions: ParsedWorkoutSession[] = [];

  for (const key of workoutOrder) {
    const group = workoutMap.get(key)!;
    const startTimeIso = parseWorkoutDate(group.startTimeStr || group.dateStr);
    const durationSeconds = parseDurationSeconds(group.durationStr);

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

      const parsedSet: ParsedSet = {
        setNumber: r.setIndex || (currentExerciseGroup ? currentExerciseGroup.sets.length + 1 : 1),
        type: normalizeSetType(r.setType, r.exerciseNotes),
        weightKg: parseWeightToKg(r.weightStr, r.weightUnit, defaultUnit),
        reps: parseReps(r.repsStr),
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
