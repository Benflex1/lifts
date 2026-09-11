import { DEFAULT_EXERCISES } from '../../database/seedData';
import { Exercise } from '../../types';
import { createScopedId } from '../ids';
import { ExerciseAssignmentItem } from './types';

/**
 * Normalizes an exercise name for basic matching:
 * Lowercases, strips parentheticals, removes non-alphanumerics, normalizes whitespace.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // remove parentheticals like (barbell), (dumbbell), (cable)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Stems common English plural suffixes so "curls" matches "curl", "raises" matches "raise", etc.
 */
export function stemWord(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (
    w.endsWith('es') &&
    (w.endsWith('shes') || w.endsWith('ches') || w.endsWith('xes') || w.endsWith('zes'))
  ) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    return w.slice(0, -1);
  }
  return w;
}

const WORD_SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  bw: 'bodyweight',
  rdl: 'romanian deadlift',
  sldl: 'stiff legged deadlift',
  ohp: 'overhead press',
  cgbp: 'close grip bench press',
  bicep: 'biceps',
  tricep: 'triceps',
  lat: 'lats',
  quad: 'quadriceps',
  quads: 'quadriceps',
  pec: 'chest',
  pecs: 'chest',
  abs: 'abdominals',
  ab: 'abdominals',
  calf: 'calves',
  glute: 'glutes',
  pulldown: 'lat pulldown',
  pullup: 'pullups',
  chinup: 'chin-up',
  flys: 'flyes',
  fly: 'flyes',
};

const STOP_WORDS = new Set([
  'with',
  'version',
  'attachment',
  'grip',
  'medium',
  'regular',
  'standard',
  'exercise',
  'movement',
  'style',
  'level',
]);

const CRITICAL_MOVEMENT_MODIFIERS = new Set([
  'incline',
  'decline',
  'overhead',
  'seated',
  'standing',
  'lying',
  'reverse',
  'front',
  'hack',
  'belt',
  'sumo',
  'romanian',
  'stiff',
  'preacher',
  'spider',
  'scott',
  'hammer',
  'hex',
  'trap',
  'landmine',
  'pendlay',
  'zercher',
  'nordic',
  'sissy',
  'split',
  'bulgarian',
  'close',
  'wide',
]);

const EQUIPMENT_TOKENS = new Set([
  'dumbbell',
  'barbell',
  'cable',
  'machine',
  'kettlebell',
  'bodyweight',
]);

/**
 * Splits an exercise name into canonical stemmed tokens with synonyms expanded.
 */
export function tokenizeExerciseName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => WORD_SYNONYMS[w] || w)
    .flatMap(w => w.split(/\s+/))
    .map(stemWord)
    .filter(w => !STOP_WORDS.has(w));
}

/**
 * Detects equipment mentioned in the exercise name or its parentheticals.
 */
export function detectEquipmentHint(name: string): string | null {
  const s = name.toLowerCase();
  if (s.includes('dumbbell') || s.includes(' db') || s.startsWith('db ') || s.includes('(db)')) return 'dumbbell';
  if (s.includes('barbell') || s.includes(' bb') || s.startsWith('bb ') || s.includes('(bb)')) return 'barbell';
  if (s.includes('cable') || s.includes('rope') || s.includes('pulley')) return 'cable';
  if (s.includes('smith')) return 'machine';
  if (s.includes('machine') || s.includes('leverage') || s.includes('plate loaded')) return 'machine';
  if (s.includes('kettlebell') || s.includes(' kb') || s.startsWith('kb ')) return 'kettlebell';
  if (s.includes('bodyweight') || s.includes('body only') || s.includes('assisted') || s.includes('body weight')) return 'body only';
  return null;
}

/**
 * Infers primary muscle group from name or category string.
 */
export function inferPrimaryMuscle(name: string, categoryHint?: string): string[] {
  if (categoryHint) {
    const cat = categoryHint.toLowerCase();
    if (cat.includes('chest')) return ['chest'];
    if (cat.includes('back') || cat.includes('lat')) return ['lats'];
    if (cat.includes('shoulder')) return ['shoulders'];
    if (cat.includes('bicep')) return ['biceps'];
    if (cat.includes('tricep')) return ['triceps'];
    if (cat.includes('quad') || cat.includes('leg')) return ['quadriceps'];
    if (cat.includes('hamstring')) return ['hamstrings'];
    if (cat.includes('glute')) return ['glutes'];
    if (cat.includes('calf') || cat.includes('calves')) return ['calves'];
    if (cat.includes('ab') || cat.includes('core')) return ['abdominals'];
  }

  const s = name.toLowerCase();
  if (s.includes('bench') || s.includes('chest') || s.includes('pec') || s.includes('fly')) return ['chest'];
  if (s.includes('deadlift') || s.includes('rdl') || s.includes('hamstring') || s.includes('leg curl')) return ['hamstrings'];
  if (s.includes('squat') || s.includes('leg press') || s.includes('lunge') || s.includes('leg extension')) return ['quadriceps'];
  if (s.includes('pullup') || s.includes('pull up') || s.includes('pulldown') || s.includes('chin') || s.includes('row') || s.includes('lat')) return ['lats'];
  if (s.includes('overhead') || s.includes('military') || s.includes('shoulder') || s.includes('lateral raise') || s.includes('deltoid')) return ['shoulders'];
  if (s.includes('bicep') || s.includes('curl')) return ['biceps'];
  if (s.includes('tricep') || s.includes('pushdown') || s.includes('skull crusher') || s.includes('dip')) return ['triceps'];
  if (s.includes('calf') || s.includes('calves')) return ['calves'];
  if (s.includes('crunch') || s.includes('sit up') || s.includes('ab') || s.includes('plank')) return ['abdominals'];
  if (s.includes('shrug') || s.includes('trap')) return ['traps'];

  return ['other'];
}

/**
 * Common cross-app exercise name mappings to bundled exercise IDs.
 * Expanded with standard terminology across Hevy, Strong, Lyfta, and FitNotes.
 */
const COMMON_ALIASES: Record<string, string> = {
  // Chest
  'bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'flat bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'flat barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'bench press barbell': 'Barbell_Bench_Press_-_Medium_Grip',
  'incline bench press': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'incline barbell bench press': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'incline bench press barbell': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'decline bench press': 'Decline_Barbell_Bench_Press',
  'decline barbell bench press': 'Decline_Barbell_Bench_Press',
  'incline dumbbell press': 'Incline_Dumbbell_Press',
  'incline dumbbell bench press': 'Incline_Dumbbell_Press',
  'incline bench press dumbbell': 'Incline_Dumbbell_Press',
  'dumbbell bench press': 'Dumbbell_Bench_Press',
  'flat dumbbell bench press': 'Dumbbell_Bench_Press',
  'bench press dumbbell': 'Dumbbell_Bench_Press',
  'decline dumbbell bench press': 'Decline_Dumbbell_Bench_Press',
  'chest press machine': 'Leverage_Chest_Press',
  'machine chest press': 'Leverage_Chest_Press',
  'incline chest press machine': 'Leverage_Incline_Chest_Press',
  'chest fly': 'Dumbbell_Flyes',
  'dumbbell fly': 'Dumbbell_Flyes',
  'dumbbell flyes': 'Dumbbell_Flyes',
  'chest fly dumbbell': 'Dumbbell_Flyes',
  'cable fly': 'Cable_Crossover',
  'cable flyes': 'Cable_Crossover',
  'cable crossover': 'Cable_Crossover',
  'chest fly cable': 'Cable_Crossover',
  'pec deck': 'Butterfly',
  'pec deck machine': 'Butterfly',
  'chest fly machine': 'Butterfly',
  'machine fly': 'Butterfly',
  'dips': 'Dips_-_Chest_Version',
  'chest dip': 'Dips_-_Chest_Version',
  'chest dips': 'Dips_-_Chest_Version',
  'push up': 'Pushups',
  'push ups': 'Pushups',
  'pushup': 'Pushups',
  'pushups': 'Pushups',

  // Back
  'deadlift': 'Barbell_Deadlift',
  'barbell deadlift': 'Barbell_Deadlift',
  'deadlift barbell': 'Barbell_Deadlift',
  'conventional deadlift': 'Barbell_Deadlift',
  'sumo deadlift': 'Sumo_Deadlift',
  'romanian deadlift': 'Romanian_Deadlift',
  'barbell romanian deadlift': 'Romanian_Deadlift',
  'romanian deadlift barbell': 'Romanian_Deadlift',
  'romanian deadlift dumbbell': 'Romanian_Deadlift',
  'rdl': 'Romanian_Deadlift',
  'stiff leg deadlift': 'Stiff-Legged_Barbell_Deadlift',
  'stiff legged deadlift': 'Stiff-Legged_Barbell_Deadlift',
  'pull up': 'Pullups',
  'pull ups': 'Pullups',
  'pullup': 'Pullups',
  'pullups': 'Pullups',
  'chin up': 'Chin-Up',
  'chin ups': 'Chin-Up',
  'lat pulldown': 'Wide-Grip_Lat_Pulldown',
  'lat pulldown cable': 'Wide-Grip_Lat_Pulldown',
  'wide grip lat pulldown': 'Wide-Grip_Lat_Pulldown',
  'close grip lat pulldown': 'Close-Grip_Front_Lat_Pulldown',
  'cable lat pulldown': 'Wide-Grip_Lat_Pulldown',
  'bent over row': 'Bent_Over_Barbell_Row',
  'barbell row': 'Bent_Over_Barbell_Row',
  'bent over barbell row': 'Bent_Over_Barbell_Row',
  'bent over row barbell': 'Bent_Over_Barbell_Row',
  'dumbbell row': 'One-Arm_Dumbbell_Row',
  'one arm dumbbell row': 'One-Arm_Dumbbell_Row',
  'single arm dumbbell row': 'One-Arm_Dumbbell_Row',
  'bent over row dumbbell': 'One-Arm_Dumbbell_Row',
  'seated cable row': 'Seated_Cable_Rows',
  'seated row': 'Seated_Cable_Rows',
  'cable row': 'Seated_Cable_Rows',
  'seated cable row cable': 'Seated_Cable_Rows',
  't bar row': 'T-Bar_Row_with_Handle',
  'face pull': 'Face_Pull',
  'face pull cable': 'Face_Pull',
  'barbell shrug': 'Barbell_Shrug',
  'shrug barbell': 'Barbell_Shrug',
  'dumbbell shrug': 'Dumbbell_Shrug',
  'shrug dumbbell': 'Dumbbell_Shrug',
  'hyperextension': 'Hyperextensions_Back_Extensions',
  'back extension': 'Hyperextensions_Back_Extensions',

  // Shoulders
  'ohp': 'Standing_Military_Press',
  'ohp barbell': 'Standing_Military_Press',
  'bb ohp': 'Standing_Military_Press',
  'overhead press': 'Standing_Military_Press',
  'overhead press barbell': 'Standing_Military_Press',
  'military press': 'Standing_Military_Press',
  'standing military press': 'Standing_Military_Press',
  'standing overhead press': 'Standing_Military_Press',
  'shoulder press': 'Standing_Military_Press',
  'barbell shoulder press': 'Barbell_Shoulder_Press',
  'dumbbell shoulder press': 'Dumbbell_Shoulder_Press',
  'shoulder press dumbbell': 'Dumbbell_Shoulder_Press',
  'seated dumbbell shoulder press': 'Dumbbell_Shoulder_Press',
  'overhead press dumbbell': 'Dumbbell_Shoulder_Press',
  'arnold press': 'Arnold_Dumbbell_Press',
  'lateral raise': 'Side_Lateral_Raise',
  'side lateral raise': 'Side_Lateral_Raise',
  'lateral raise dumbbell': 'Side_Lateral_Raise',
  'dumbbell lateral raise': 'Side_Lateral_Raise',
  'side raise': 'Side_Lateral_Raise',
  'front raise': 'Front_Dumbbell_Raise',
  'dumbbell front raise': 'Front_Dumbbell_Raise',
  'reverse fly': 'Seated_Bent-Over_Rear_Delt_Raise',
  'rear delt fly': 'Seated_Bent-Over_Rear_Delt_Raise',
  'rear delt raise': 'Seated_Bent-Over_Rear_Delt_Raise',

  // Arms
  'bicep curl': 'Dumbbell_Bicep_Curl',
  'bicep curl dumbbell': 'Dumbbell_Bicep_Curl',
  'dumbbell bicep curl': 'Dumbbell_Bicep_Curl',
  'dumbbell curl': 'Dumbbell_Bicep_Curl',
  'barbell curl': 'Barbell_Curl',
  'barbell bicep curl': 'Barbell_Curl',
  'bicep curl barbell': 'Barbell_Curl',
  'hammer curl': 'Alternate_Hammer_Curl',
  'hammer curl dumbbell': 'Alternate_Hammer_Curl',
  'dumbbell hammer curl': 'Alternate_Hammer_Curl',
  'preacher curl': 'Preacher_Curl',
  'preacher curl barbell': 'Preacher_Curl',
  'preacher curl machine': 'Preacher_Curl',
  'incline dumbbell curl': 'Incline_Dumbbell_Curl',
  'concentration curl': 'Concentration_Curls',
  'tricep pushdown': 'Triceps_Pushdown',
  'triceps pushdown': 'Triceps_Pushdown',
  'triceps pushdown cable': 'Triceps_Pushdown',
  'tricep pushdown cable': 'Triceps_Pushdown',
  'cable pushdown': 'Triceps_Pushdown',
  'rope pushdown': 'Triceps_Pushdown_-_Rope_Attachment',
  'tricep rope pushdown': 'Triceps_Pushdown_-_Rope_Attachment',
  'skull crusher': 'Lying_Triceps_Press',
  'skullcrusher': 'Lying_Triceps_Press',
  'skull crusher barbell': 'Lying_Triceps_Press',
  'lying triceps extension': 'Lying_Triceps_Press',
  'tricep extension': 'Lying_Triceps_Press',
  'overhead tricep extension': 'Standing_Dumbbell_Triceps_Extension',
  'overhead triceps extension': 'Standing_Dumbbell_Triceps_Extension',
  'dips triceps': 'Dips_-_Triceps_Version',
  'tricep dips': 'Dips_-_Triceps_Version',

  // Legs
  'squat': 'Barbell_Full_Squat',
  'squat barbell': 'Barbell_Full_Squat',
  'barbell squat': 'Barbell_Full_Squat',
  'back squat': 'Barbell_Full_Squat',
  'barbell full squat': 'Barbell_Full_Squat',
  'front squat': 'Front_Barbell_Squat',
  'front squat barbell': 'Front_Barbell_Squat',
  'hack squat': 'Barbell_Hack_Squat',
  'leg press': 'Leg_Press',
  'leg press machine': 'Leg_Press',
  'leg extension': 'Leg_Extensions',
  'leg extensions': 'Leg_Extensions',
  'leg extension machine': 'Leg_Extensions',
  'leg curl': 'Lying_Leg_Curls',
  'lying leg curl': 'Lying_Leg_Curls',
  'lying leg curl machine': 'Lying_Leg_Curls',
  'seated leg curl': 'Seated_Leg_Curl',
  'seated leg curl machine': 'Seated_Leg_Curl',
  'calf raise': 'Standing_Calf_Raises',
  'standing calf raise': 'Standing_Calf_Raises',
  'standing calf raise machine': 'Standing_Calf_Raises',
  'seated calf raise': 'Barbell_Seated_Calf_Raise',
  'hip thrust': 'Barbell_Hip_Thrust',
  'hip thrust barbell': 'Barbell_Hip_Thrust',
  'barbell hip thrust': 'Barbell_Hip_Thrust',
  'glute bridge': 'Barbell_Glute_Bridge',
  'lunge': 'Barbell_Lunge',
  'walking lunge': 'Dumbbell_Lunges',
  'lunge dumbbell': 'Dumbbell_Lunges',

  // Abs
  'crunch': 'Crunches',
  'crunches': 'Crunches',
  'cable crunch': 'Cable_Crunch',
  'hanging leg raise': 'Hanging_Leg_Raise',
  'plank': 'Plank',
  'ab rollout': 'Barbell_Ab_Rollout',
  'ab wheel rollout': 'Barbell_Ab_Rollout',
  'russian twist': 'Russian_Twist',
};

interface ExerciseUsageStats {
  rawName: string;
  workoutKeys: Set<string>;
  setCount: number;
}

export class ExerciseMapper {
  private bundledMap = new Map<string, Exercise>();
  private normalizedMap = new Map<string, Exercise>();
  private customExercises = new Map<string, Exercise>();
  private allKnownExercises: Exercise[];
  private overrides = new Map<string, Exercise>();
  private usageStats = new Map<string, ExerciseUsageStats>();
  private resolvedCache = new Map<string, {
    exercise: Exercise;
    isNew: boolean;
    confidence: 'exact' | 'alias' | 'fuzzy' | 'custom' | 'manual';
    isAutoMatched: boolean;
  }>();

  constructor(
    existingExercises: Exercise[] = [],
    overrides?: Record<string, Exercise>
  ) {
    this.allKnownExercises = [...DEFAULT_EXERCISES, ...existingExercises.filter(e => e.isCustom)];

    for (const ex of this.allKnownExercises) {
      this.bundledMap.set(ex.id, ex);
      const norm = normalizeExerciseName(ex.name);
      if (!this.normalizedMap.has(norm)) {
        this.normalizedMap.set(norm, ex);
      }
    }

    if (overrides) {
      for (const [rawKey, ex] of Object.entries(overrides)) {
        this.overrides.set(rawKey.trim().toLowerCase(), ex);
      }
    }
  }

  /**
   * Tracks usage of raw exercise names across workouts and sets for review sorting.
   */
  public recordUsage(rawName: string, workoutKey: string): void {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    const lowerKey = trimmed.toLowerCase();

    let stats = this.usageStats.get(lowerKey);
    if (!stats) {
      stats = { rawName: trimmed, workoutKeys: new Set(), setCount: 0 };
      this.usageStats.set(lowerKey, stats);
    }
    stats.workoutKeys.add(workoutKey);
    stats.setCount++;
  }

  /**
   * Matches an incoming exercise name against known exercises or applies manual overrides.
   * If not matched, creates and caches a new custom Exercise.
   */
  public getOrCreateExercise(
    rawName: string,
    categoryHint?: string
  ): {
    exercise: Exercise;
    isNew: boolean;
    confidence: 'exact' | 'alias' | 'fuzzy' | 'custom' | 'manual';
    isAutoMatched: boolean;
  } {
    const trimmed = rawName.trim();
    if (!trimmed) {
      const fallback = this.bundledMap.get('Barbell_Bench_Press_-_Medium_Grip') || DEFAULT_EXERCISES[0];
      return { exercise: fallback, isNew: false, confidence: 'exact', isAutoMatched: true };
    }

    const lowerKey = trimmed.toLowerCase();

    // 0. Check Manual Overrides
    if (this.overrides.has(lowerKey)) {
      const overrideEx = this.overrides.get(lowerKey)!;
      const isCustomNew = Boolean(overrideEx.isCustom && !this.bundledMap.has(overrideEx.id));
      if (isCustomNew) {
        this.customExercises.set(lowerKey, overrideEx);
      }
      const result = {
        exercise: overrideEx,
        isNew: isCustomNew,
        confidence: 'manual' as const,
        isAutoMatched: false,
      };
      this.resolvedCache.set(lowerKey, result);
      return result;
    }

    // Check cached resolution from earlier in this import run
    if (this.resolvedCache.has(lowerKey)) {
      return this.resolvedCache.get(lowerKey)!;
    }

    // 1. Direct ID match
    if (this.bundledMap.has(trimmed)) {
      const ex = this.bundledMap.get(trimmed)!;
      const res = { exercise: ex, isNew: false, confidence: 'exact' as const, isAutoMatched: true };
      this.resolvedCache.set(lowerKey, res);
      return res;
    }

    const equipHint = detectEquipmentHint(trimmed);
    const norm = normalizeExerciseName(trimmed);

    // 2. Direct normalized match against library
    if (this.normalizedMap.has(norm)) {
      const candidate = this.normalizedMap.get(norm)!;
      if (!equipHint || candidate.equipment.toLowerCase().includes(equipHint)) {
        const res = { exercise: candidate, isNew: false, confidence: 'exact' as const, isAutoMatched: true };
        this.resolvedCache.set(lowerKey, res);
        return res;
      }
    }

    const rawTokens = tokenizeExerciseName(trimmed);
    const tokenStr = rawTokens.join(' ');

    // 3. Common alias dictionary check
    // Try equipment-qualified keys first, then token string, then bare movement name
    const aliasKeys: string[] = [];
    if (equipHint) {
      aliasKeys.push(`${norm} ${equipHint}`);
      aliasKeys.push(`${equipHint} ${norm}`);
      aliasKeys.push(trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim());
    }
    aliasKeys.push(norm);
    if (tokenStr && tokenStr !== norm) {
      aliasKeys.push(tokenStr);
    }

    for (const ak of aliasKeys) {
      if (COMMON_ALIASES[ak]) {
        const targetId = COMMON_ALIASES[ak];
        if (this.bundledMap.has(targetId)) {
          const ex = this.bundledMap.get(targetId)!;
          const exEq = (ex.equipment || '').toLowerCase();
          const exName = ex.name.toLowerCase();
          // Avoid contradictory equipment match (e.g. user specifies dumbbell but alias points to barbell)
          if (equipHint === 'dumbbell' && (exEq.includes('barbell') || exName.includes('barbell'))) {
            continue;
          }
          if (equipHint === 'barbell' && (exEq.includes('dumbbell') || exName.includes('dumbbell'))) {
            continue;
          }
          const res = { exercise: ex, isNew: false, confidence: 'alias' as const, isAutoMatched: true };
          this.resolvedCache.set(lowerKey, res);
          return res;
        }
      }
    }

    // 4. Equipment-aware fuzzy token matching
    if (rawTokens.length > 0) {
      let bestCandidate: Exercise | null = null;
      let bestScore = 0;

      const rawSet = new Set(rawTokens);

      for (const candidate of this.allKnownExercises) {
        const candTokens = tokenizeExerciseName(candidate.name);
        const candSet = new Set(candTokens);
        const candEq = candidate.equipment ? candidate.equipment.toLowerCase() : '';
        const candName = candidate.name.toLowerCase();

        // Avoid contradictory equipment match (e.g. dumbbell vs barbell, machine/cable vs free weight)
        if (equipHint) {
          const isCandidateFreeWeight =
            candEq.includes('barbell') ||
            candEq.includes('dumbbell') ||
            candName.includes('barbell') ||
            candName.includes('dumbbell');
          if (equipHint === 'dumbbell' && (candEq.includes('barbell') || candName.includes('barbell'))) {
            continue;
          }
          if (equipHint === 'barbell' && (candEq.includes('dumbbell') || candName.includes('dumbbell'))) {
            continue;
          }
          if ((equipHint === 'machine' || equipHint === 'cable') && isCandidateFreeWeight) {
            continue;
          }
          if ((candEq.includes('machine') || candEq.includes('cable')) && (equipHint === 'barbell' || equipHint === 'dumbbell')) {
            continue;
          }
        }

        // Avoid critical modifier contradictions (e.g. belt vs lying, incline vs decline, seated vs standing)
        let hasModifierMismatch = false;
        for (const mod of CRITICAL_MOVEMENT_MODIFIERS) {
          if (rawSet.has(mod) !== candSet.has(mod)) {
            hasModifierMismatch = true;
            break;
          }
        }
        if (hasModifierMismatch) {
          continue;
        }

        // Calculate intersection
        let intersection = 0;
        for (const t of rawSet) {
          if (candSet.has(t)) intersection++;
        }

        if (intersection === 0) continue;

        const union = new Set([...rawSet, ...candSet]).size;
        const jaccard = intersection / union;

        // Check if one is a subset of the other and non-intersecting tokens are benign
        const isCandSubset = intersection === candSet.size;
        const isRawSubset = intersection === rawSet.size;

        const rawExtraOnlyEquipmentOrFiller = [...rawSet]
          .filter(t => !candSet.has(t))
          .every(t => EQUIPMENT_TOKENS.has(t) || t === 'custom' || t === 'exercise');
        const candExtraOnlyEquipmentOrFiller = [...candSet]
          .filter(t => !rawSet.has(t))
          .every(t => EQUIPMENT_TOKENS.has(t) || t === 'exercise');

        let score = jaccard;
        if (isCandSubset && rawExtraOnlyEquipmentOrFiller) {
          score = Math.max(score, 0.85);
        } else if (isRawSubset && candExtraOnlyEquipmentOrFiller) {
          score = Math.max(score, 0.85);
        }

        // Equipment agreement bonus
        if (equipHint && candEq.includes(equipHint) && score >= 0.7) {
          score += 0.05;
        }

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      // If confidence score exceeds threshold, auto-match!
      if (bestCandidate && bestScore >= 0.75) {
        const res = { exercise: bestCandidate, isNew: false, confidence: 'fuzzy' as const, isAutoMatched: true };
        this.resolvedCache.set(lowerKey, res);
        return res;
      }
    }

    // 5. Fallback: Create new custom exercise and flag for review
    const customId = createScopedId('custom-ex');
    const newExercise: Exercise = {
      id: customId,
      name: trimmed,
      category: 'strength',
      equipment: equipHint || 'other',
      primaryMuscles: inferPrimaryMuscle(trimmed, categoryHint),
      secondaryMuscles: [],
      instructions: [],
      isCustom: true,
    };

    this.customExercises.set(lowerKey, newExercise);
    this.bundledMap.set(customId, newExercise);
    this.normalizedMap.set(norm, newExercise);

    const res = { exercise: newExercise, isNew: true, confidence: 'custom' as const, isAutoMatched: false };
    this.resolvedCache.set(lowerKey, res);
    return res;
  }

  /**
   * Returns newly created custom exercises that should be merged into the snapshot.
   */
  public getNewlyCreatedExercises(): Exercise[] {
    return Array.from(this.customExercises.values());
  }

  /**
   * Returns a detailed list of all unique exercise assignments in this import,
   * sorted with unassigned/custom exercises first, followed by highest set count.
   */
  public getExerciseAssignments(): ExerciseAssignmentItem[] {
    const items: ExerciseAssignmentItem[] = [];

    for (const [rawLower, stats] of this.usageStats.entries()) {
      const resolved = this.resolvedCache.get(rawLower);
      if (!resolved) continue;

      items.push({
        rawName: stats.rawName,
        workoutCount: stats.workoutKeys.size,
        setCount: stats.setCount,
        assignedExercise: resolved.exercise,
        isCustom: Boolean(resolved.exercise.isCustom),
        isAutoMatched: resolved.isAutoMatched,
        confidence: resolved.confidence,
      });
    }

    // Sort: needs review (custom / not auto-matched) first, then by setCount descending
    items.sort((a, b) => {
      const aNeedsReview = a.isCustom || !a.isAutoMatched;
      const bNeedsReview = b.isCustom || !b.isAutoMatched;
      if (aNeedsReview && !bNeedsReview) return -1;
      if (!aNeedsReview && bNeedsReview) return 1;
      return b.setCount - a.setCount;
    });

    return items;
  }
}
