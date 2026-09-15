import { Exercise } from '../types';
import { DEFAULT_EXERCISES } from '../database/seedData';
import { getFreeExerciseDbGuideUrl } from '../database/exercise-source';

export interface ExerciseInstructionLink {
  url: string;
  type: 'website' | 'youtube';
  label: string;
  isFallback: boolean;
}

const isYouTubeUrl = (url: URL): boolean => {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
};

const bundledExerciseIds = new Set(DEFAULT_EXERCISES.map(exercise => exercise.id));

const isValidCuratedLink = (
  url: unknown,
  type: unknown,
): url is string => {
  if (typeof url !== 'string' || !url || url.trim() !== url) return false;
  if (type !== 'website' && type !== 'youtube') return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (!parsed.hostname || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return false;
  return (type === 'youtube') === isYouTubeUrl(parsed);
};

export function getExerciseInstructionLink(exercise: Exercise): ExerciseInstructionLink {
  const type = exercise.instructionUrlType;
  if (isValidCuratedLink(exercise.instructionUrl, type) && (type === 'website' || type === 'youtube')) {
    return {
      url: exercise.instructionUrl,
      type,
      label: type === 'youtube' ? 'Watch form video' : 'Open exercise guide',
      isFallback: false,
    };
  }

  if (exercise.isCustom !== true && bundledExerciseIds.has(exercise.id)) {
    return {
      url: getFreeExerciseDbGuideUrl(exercise.id),
      type: 'website',
      label: 'Open exercise guide',
      isFallback: true,
    };
  }

  const query = exercise.name + ' exercise form';
  return {
    url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query),
    type: 'youtube',
    label: 'Find form videos on YouTube',
    isFallback: true,
  };
}

export async function openExerciseInstructionLink(link: ExerciseInstructionLink): Promise<void> {
  const { Linking } = await import('react-native');
  await Linking.openURL(link.url);
}
