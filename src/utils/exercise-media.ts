import { Exercise } from '../types';

export type ExerciseVisualTemplate =
  | 'push'
  | 'pull'
  | 'squat'
  | 'hinge'
  | 'carry'
  | 'core'
  | 'stretch'
  | 'cardio'
  | 'general';

export type ExerciseVisualDescriptor =
  | { kind: 'open-asset'; assetKey: string; alt: string }
  | { kind: 'generated'; template: ExerciseVisualTemplate; alt: string };

/**
 * This is intentionally an ID-keyed allowlist. A new asset needs a reviewed
 * provenance entry before it can be returned by the resolver.
 */
export const REVIEWED_EXERCISE_ASSETS: Readonly<Record<string, string>> = Object.freeze({
  Plank: 'workout-guide/plank/frame-1.svg',
});

const normalize = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const includesAny = (value: string, phrases: readonly string[]): boolean =>
  phrases.some(phrase => value.includes(phrase));

const selectTemplate = (exercise: Exercise): ExerciseVisualTemplate => {
  const name = normalize(exercise.name);
  const category = normalize(exercise.category);
  const equipment = normalize(exercise.equipment);
  const muscles = [
    ...(Array.isArray(exercise.primaryMuscles) ? exercise.primaryMuscles : []),
    ...(Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles : []),
  ].map(normalize).join(' ');

  // These checks are ordered from the most specific movement family to the
  // broadest, so a "chest stretch" remains a stretch rather than a push.
  if (includesAny(category, ['stretch', 'mobility']) || includesAny(name, ['stretch', 'mobility', 'yoga'])) {
    return 'stretch';
  }
  if (includesAny(category, ['cardio', 'aerobic', 'conditioning']) || includesAny(name, [
    'run', 'jog', 'sprint', 'cycle', 'cycling', 'bike', 'burpee', 'jump rope', 'jumping jack',
  ])) {
    return 'cardio';
  }
  if (includesAny(name, ['farmer walk', 'suitcase carry', 'carry', 'yoke walk', 'waiter walk'])) {
    return 'carry';
  }
  if (includesAny(name, [
    'plank', 'crunch', 'sit up', 'situp', 'leg raise', 'knee raise', 'russian twist',
    'wood chop', 'pallof', 'ab wheel', 'dead bug', 'hollow',
  ]) || includesAny(muscles, ['abdominals', 'abdominal', 'abs', 'core'])) {
    return 'core';
  }
  if (includesAny(name, ['squat', 'lunge', 'leg press', 'step up', 'stepup'])) {
    return 'squat';
  }
  if (includesAny(name, [
    'deadlift', 'romanian deadlift', 'stiff leg', 'straight leg', 'good morning',
    'hip thrust', 'glute bridge', 'back extension', 'hyperextension', 'kettlebell swing',
  ]) || includesAny(muscles, ['hamstrings', 'glutes', 'lower back'])) {
    return 'hinge';
  }
  if (includesAny(name, [
    'pull up', 'pullup', 'chin up', 'chinup', 'pulldown', 'pull down', 'row', 'curl',
    'face pull', 'shrug', 'rear delt', 'reverse fly', 'reverse flye',
  ]) || includesAny(muscles, ['lats', 'biceps', 'middle back', 'upper back'])) {
    return 'pull';
  }
  if (includesAny(name, [
    'push up', 'pushup', 'press', 'bench', 'chest fly', 'pec deck', 'dip',
    'triceps extension', 'skull crusher',
  ]) || includesAny(muscles, ['chest', 'triceps'])) {
    return 'push';
  }
  if (includesAny(equipment, ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band'])) {
    return 'general';
  }
  return 'general';
};

export function getExerciseVisual(exercise: Exercise): ExerciseVisualDescriptor {
  const alt = `${typeof exercise.name === 'string' && exercise.name.trim() ? exercise.name.trim() : 'Exercise'} exercise illustration`;
  const assetKey = typeof exercise.id === 'string' ? REVIEWED_EXERCISE_ASSETS[exercise.id] : undefined;

  if (assetKey) {
    return { kind: 'open-asset', assetKey, alt };
  }

  return { kind: 'generated', template: selectTemplate(exercise), alt };
}
