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
    return [...list]
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aStaple = STAPLE_EXERCISES[aName] || (POPULAR_FALLBACKS.some(p => aName.includes(p)) ? 500 : 0);
        const bStaple = STAPLE_EXERCISES[bName] || (POPULAR_FALLBACKS.some(p => bName.includes(p)) ? 500 : 0);
        if (aStaple !== bStaple) return bStaple - aStaple;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 100);
  }

  const normalizedQuery = normalizeText(rawClean);
  const rawTokens = normalizedQuery.split(' ').filter(Boolean);

  // Expand aliases: each query token could match its alias expansions
  const expandedTokenGroups: string[][] = rawTokens.map(token => {
    const aliases = ALIAS_MAP[token] || [];
    return [token, ...aliases.map(a => normalizeText(a))];
  });

  const scored: { item: Exercise; score: number }[] = [];

  for (const item of list) {
    const rawName = item.name.toLowerCase();
    const normName = normalizeText(item.name);
    const normMuscle = normalizeText(item.primaryMuscles.join(' '));
    const normEquip = normalizeText(item.equipment || '');
    const normCategory = normalizeText(item.category || '');
    const fullNormalized = `${normName} ${normMuscle} ${normEquip} ${normCategory}`;

    // Verify all token groups have at least one match in metadata
    const matchesAll = expandedTokenGroups.every(group =>
      group.some(t => fullNormalized.includes(t) || normName.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')))
    );
    if (!matchesAll) continue;

    let score = 0;

    // Staple exercise baseline boost
    if (STAPLE_EXERCISES[rawName]) {
      score += STAPLE_EXERCISES[rawName];
    }

    // Exact name match
    if (normName === normalizedQuery) {
      score += 5000;
    }
    // Name starts with full query
    else if (normName.startsWith(normalizedQuery)) {
      score += 2500;
    }
    // Name contains full phrase
    else if (normName.includes(normalizedQuery)) {
      score += 1200;
    }

    // Token position & precision scoring
    for (const group of expandedTokenGroups) {
      const primaryToken = group[0];
      if (normName.startsWith(primaryToken)) {
        score += 300;
      } else if (normName.includes(primaryToken)) {
        score += 150;
      } else if (group.some(alias => normName.includes(alias))) {
        score += 120;
      } else if (normMuscle.includes(primaryToken)) {
        score += 80;
      } else if (normEquip.includes(primaryToken)) {
        score += 50;
      }
    }

    // Shorter exercise names are generally more core than long variations
    score += Math.max(0, 100 - normName.length);

    // Custom user exercises boost
    if (item.isCustom) {
      score += 400;
    }

    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.item).slice(0, 100);
}
