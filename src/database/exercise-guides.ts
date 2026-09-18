export const MUSCLEWIKI_GUIDE_BASE_URL = 'https://musclewiki.com';

const MUSCLEWIKI_GUIDES: Readonly<Record<string, string>> = Object.freeze({
  'Barbell_Bench_Press_-_Medium_Grip': `${MUSCLEWIKI_GUIDE_BASE_URL}/exercise/barbell-bench-press`,
  Barbell_Deadlift: `${MUSCLEWIKI_GUIDE_BASE_URL}/exercise/barbell-deadlift`,
  Barbell_Curl: `${MUSCLEWIKI_GUIDE_BASE_URL}/exercise/barbell-curl`,
  Dumbbell_Bench_Press: `${MUSCLEWIKI_GUIDE_BASE_URL}/exercise/dumbbell-bench-press`,
  Incline_Dumbbell_Press: `${MUSCLEWIKI_GUIDE_BASE_URL}/exercise/dumbbell-incline-bench-press`,
  Pushups: `${MUSCLEWIKI_GUIDE_BASE_URL}/exercise/push-up`,
});

export function getMuscleWikiGuideUrl(exerciseId: string): string | undefined {
  return MUSCLEWIKI_GUIDES[exerciseId];
}
