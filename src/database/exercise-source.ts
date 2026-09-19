export const FREE_EXERCISE_DB_REVISION = 'a859101d633a01c4a1a920d6a8ce41dabba0705f';
export const FREE_EXERCISE_DB_REPOSITORY_URL = 'https://github.com/yuhonas/free-exercise-db';

const FREE_EXERCISE_DB_RAW_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db';

export function getFreeExerciseDbImageUrls(exerciseId: string): readonly [string, string] {
  const path = `${FREE_EXERCISE_DB_RAW_URL}/${FREE_EXERCISE_DB_REVISION}/exercises/${encodeURIComponent(exerciseId)}`;
  return [`${path}/0.jpg`, `${path}/1.jpg`];
}
