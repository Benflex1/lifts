import { Exercise } from '../types';

// Common gym abbreviations, synonyms, and slang mapped to search expansions
const ALIAS_MAP: Record<string, string[]> = {
  bench: ['bench press', 'chest press'],
  bp: ['bench press'],
  ohp: ['overhead press', 'military press', 'standing military'],
  military: ['military press', 'overhead press'],
  rdl: ['romanian deadlift', 'stiff-legged'],
  dl: ['deadlift'],
  deadlift: ['barbell deadlift', 'romanian deadlift'],
  sq: ['squat'],
  squat: ['barbell full squat', 'barbell squat'],
  db: ['dumbbell'],
  bb: ['barbell'],
  tri: ['triceps', 'tricep'],
  tricep: ['triceps'],
  bi: ['biceps', 'bicep'],
  bicep: ['biceps'],
  abs: ['abdominals', 'abdominal', 'core', 'crunch'],
  core: ['abdominals'],
  quad: ['quadriceps', 'quad'],
  quads: ['quadriceps'],
  ham: ['hamstrings', 'hamstring'],
  hamstring: ['hamstrings'],
  hamstrings: ['hamstrings'],
  glute: ['glutes'],
  delt: ['deltoid', 'deltoids', 'shoulders'],
  delts: ['deltoid', 'deltoids', 'shoulders'],
  lat: ['lats', 'latissimus dorsi', 'lat pulldown', 'pulldown'],
  lats: ['latissimus dorsi', 'lat pulldown', 'pulldown'],
  trap: ['traps', 'trapezius'],
  traps: ['trapezius'],
  pullup: ['pull-up', 'pullups', 'pull up', 'chin-up'],
  pullups: ['pull-up', 'pullup', 'pull up'],
  chinup: ['chin-up', 'chin up'],
  row: ['bent over barbell row', 'dumbbell row', 'cable row'],
  fly: ['flye', 'flyes', 'crossover'],
  flyes: ['fly', 'flye', 'crossover'],
  pushdown: ['push down', 'pressdown', 'push-down', 'triceps pushdown'],
  pulldown: ['pull down', 'lat pulldown', 'pull-down', 'wide-grip lat pulldown'],
};

// Priority staple exercises that lifters expect first when searching broad terms
const STAPLE_EXERCISES: Record<string, number> = {
  'barbell bench press - medium grip': 3000,
  'barbell full squat': 3000,
  'barbell deadlift': 3000,
  'standing military press': 3000,
  'pullups': 3000,
  'wide-grip lat pulldown': 2800,
  'bent over barbell row': 2800,
  'incline dumbbell press': 2800,
  'romanian deadlift': 2800,
  'dumbbell bicep curl': 2600,
  'triceps pushdown': 2600,
  'side lateral raise': 2600,
  'leg press': 2600,
  'lying leg curls': 2500,
  'leg extensions': 2500,
  'cable crossover': 2400,
  'standing calf raises': 2400,
  'dips - chest version': 2400,
  'close-grip barbell bench press': 2400,
  'barbell curl': 2400,
};

const POPULAR_FALLBACKS = [
  'barbell bench press - medium grip',
  'barbell full squat',
  'barbell deadlift',
  'standing military press',
  'pullups',
  'wide-grip lat pulldown',
  'bent over barbell row',
  'incline dumbbell press',
  'romanian deadlift',
  'dumbbell bicep curl',
  'triceps pushdown',
  'side lateral raise',
  'leg press',
  'cable crossover',
  'standing calf raises',
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ExerciseSearchIndex {
  normName: string;
  normNameCompact: string;
  normMuscle: string;
  normEquip: string;
  fullNormalized: string;
  stapleScore: number;
}

// Normalization runs four or more regex passes per exercise; the catalog is
// immutable between syncs, so each exercise object is indexed once.
const searchIndexCache = new WeakMap<Exercise, ExerciseSearchIndex>();

function getSearchIndex(exercise: Exercise): ExerciseSearchIndex {
  const cached = searchIndexCache.get(exercise);
  if (cached) return cached;

  const rawName = exercise.name.toLowerCase();
  const normName = normalizeText(exercise.name);
  const normCategory = normalizeText(exercise.category || '');
  const normMuscle = normalizeText(exercise.primaryMuscles.join(' '));
  const normEquip = normalizeText(exercise.equipment || '');
  const exactStaple = STAPLE_EXERCISES[rawName];
  const stapleScore =
    exactStaple !== undefined
      ? exactStaple
      : POPULAR_FALLBACKS.some(p => rawName.includes(p))
        ? 500
        : 0;

  const index: ExerciseSearchIndex = {
    normName,
    normNameCompact: normName.replace(/\s+/g, ''),
    normMuscle,
    normEquip,
    fullNormalized: `${normName} ${normMuscle} ${normEquip} ${normCategory}`,
    stapleScore,
  };
  searchIndexCache.set(exercise, index);
  return index;
}

// The unfiltered empty-query list is also queried repeatedly (opening the picker
// with no text); sort it once per catalog array identity.
const emptyQueryTop100Cache = new WeakMap<Exercise[], Exercise[]>();

function compareByStapleThenName(a: Exercise, b: Exercise): number {
  const aStaple = getSearchIndex(a).stapleScore;
  const bStaple = getSearchIndex(b).stapleScore;
  if (aStaple !== bStaple) return bStaple - aStaple;
  return a.name.localeCompare(b.name);
}

export function smartSearchExercises(
  allExercises: Exercise[],
  query: string = '',
  muscle: string = 'All',
  equipment: string = 'All'
): Exercise[] {
  let list = allExercises;

  // Filter by muscle
  if (muscle && muscle !== 'All') {
    const m = muscle.toLowerCase();
    list = list.filter(e =>
      e.primaryMuscles.some(pm => pm.toLowerCase().includes(m))
    );
  }

  // Filter by equipment
  if (equipment && equipment !== 'All') {
    const eq = equipment.toLowerCase();
    list = list.filter(e =>
      (e.equipment || '').toLowerCase().includes(eq)
    );
  }

  const rawClean = query.trim().toLowerCase();

  // If query is empty, sort staples first, then alphabetical
  if (!rawClean) {
    const unfiltered = list === allExercises;
    if (unfiltered) {
      const cached = emptyQueryTop100Cache.get(allExercises);
      if (cached) return cached.slice();
      const sorted = [...allExercises].sort(compareByStapleThenName).slice(0, 100);
      emptyQueryTop100Cache.set(allExercises, sorted);
      return sorted.slice();
    }
    return [...list].sort(compareByStapleThenName).slice(0, 100);
  }

  const normalizedQuery = normalizeText(rawClean);
  const rawTokens = normalizedQuery.split(' ').filter(Boolean);

  // Expand aliases: each query token could match its alias expansions
  const expandedTokenGroups = rawTokens.map(token => {
    const tokens = [token, ...(ALIAS_MAP[token] || []).map(a => normalizeText(a))];
    return { tokens, compact: tokens.map(t => t.replace(/\s+/g, '')) };
  });

  const scored: { item: Exercise; score: number }[] = [];

  for (const item of list) {
    const index = getSearchIndex(item);

    // Verify all token groups have at least one match in metadata
    const matchesAll = expandedTokenGroups.every(group =>
      group.tokens.some(
        (t, i) =>
          index.fullNormalized.includes(t) || index.normNameCompact.includes(group.compact[i])
      )
    );
    if (!matchesAll) continue;

    let score = index.stapleScore;

    // Exact name match
    if (index.normName === normalizedQuery) {
      score += 5000;
    }
    // Name starts with full query
    else if (index.normName.startsWith(normalizedQuery)) {
      score += 2500;
    }
    // Name contains full phrase
    else if (index.normName.includes(normalizedQuery)) {
      score += 1200;
    }

    // Token position & precision scoring
    for (const group of expandedTokenGroups) {
      const primaryToken = group.tokens[0];
      if (index.normName.startsWith(primaryToken)) {
        score += 300;
      } else if (index.normName.includes(primaryToken)) {
        score += 150;
      } else if (group.tokens.some(alias => index.normName.includes(alias))) {
        score += 120;
      } else if (index.normMuscle.includes(primaryToken)) {
        score += 80;
      } else if (index.normEquip.includes(primaryToken)) {
        score += 50;
      }
    }

    // Shorter exercise names are generally more core than long variations
    score += Math.max(0, 100 - index.normName.length);

    // Custom user exercises boost
    if (item.isCustom) {
      score += 400;
    }

    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.item).slice(0, 100);
}
