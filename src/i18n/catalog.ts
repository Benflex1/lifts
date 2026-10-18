/**
 * PROD-04: message catalog. `en` is the source of truth for keys; every other
 * locale must implement the same keys (the type below enforces completeness).
 *
 * The catalog currently covers the navigation shell, the Workout screen, the
 * workout header, the workout options menu, and the rest overlay. Remaining
 * screens are tracked in PROD-07.
 */

export type Locale = 'en' | 'de';

const en = {
  'nav.workout': 'Workout',
  'nav.history': 'History',
  'nav.exercises': 'Exercises',
  'nav.progress': 'Progress',

  'workout.title': 'Workout',
  'workout.openSettings': 'Open settings',
  'workout.quickStartTitle': 'Start Empty Workout',
  'workout.quickStartSubtitle': 'Log exercises as you go',
  'workout.startEmptyA11y': 'Start empty workout',
  'workout.routines': 'Routines',
  'workout.newRoutine': '+ New',
  'workout.manageFolders': 'Manage folders',
  'workout.emptyTitle': 'Create your first routine',
  'workout.emptySubtitle': 'Save your go-to workouts and start them in one tap.',
  'workout.emptyText': 'No routines in this folder.',
  'workout.routineMetaOne': '{exercises} exercise · {sets} sets',
  'workout.routineMetaOther': '{exercises} exercises · {sets} sets',
  'workout.startRoutine': 'Start Routine',
  'workout.startRoutineOf': 'Start {name}',
  'workout.supersets': 'Supersets',

  'logger.duration': 'Duration',
  'logger.volume': 'Volume',
  'logger.sets': 'Sets',
  'logger.finish': 'Finish',
  'logger.saving': 'Saving...',
  'logger.workoutDuration': 'Workout duration',
  'logger.durationHint': 'Opens workout duration options',
  'logger.minimize': 'Minimize workout',
  'logger.menu': 'Workout menu',
  'logger.finishA11y': 'Finish workout',

  'menu.close': 'Close workout options',
  'menu.expandAll': 'Expand all exercises',
  'menu.expandAllVisible': 'Expand All Exercises',
  'menu.collapseAll': 'Collapse all exercises',
  'menu.collapseAllVisible': 'Collapse All Exercises',
  'menu.reorder': 'Reorder exercises',
  'menu.reorderVisible': 'Reorder Exercises',
  'menu.changeGym': 'Change Gym · {gym}',
  'menu.changeGymA11y': 'Change workout gym, currently {gym}',
  'menu.adjustTime': 'Adjust workout duration',
  'menu.adjustTimeVisible': 'Adjust Workout Time',
  'menu.showRpe': 'Show RPE Column',
  'menu.showRpeA11y': 'Show RPE column',
  'menu.hideRpe': 'Hide RPE Column',
  'menu.hideRpeA11y': 'Hide RPE column',
  'menu.discard': 'Discard Workout',
  'menu.discardA11y': 'Discard workout',

  'rest.title': 'Rest Time',
  'rest.remaining': 'Rest time remaining',
  'rest.getReady': 'Get Ready! ({seconds})',
  'rest.next': 'NEXT',
  'rest.increase': 'Increase rest timer by 30 seconds',
  'rest.decrease': 'Decrease rest timer by 30 seconds',
  'rest.skip': 'Skip rest',
} as const;

export type MessageKey = keyof typeof en;

const de: Record<MessageKey, string> = {
  'nav.workout': 'Training',
  'nav.history': 'Verlauf',
  'nav.exercises': 'Übungen',
  'nav.progress': 'Fortschritt',

  'workout.title': 'Training',
  'workout.openSettings': 'Einstellungen öffnen',
  'workout.quickStartTitle': 'Leeres Training starten',
  'workout.quickStartSubtitle': 'Übungen während des Trainings erfassen',
  'workout.startEmptyA11y': 'Leeres Training starten',
  'workout.routines': 'Trainingspläne',
  'workout.newRoutine': '+ Neu',
  'workout.manageFolders': 'Ordner verwalten',
  'workout.emptyTitle': 'Erstelle deinen ersten Trainingsplan',
  'workout.emptySubtitle': 'Speichere deine Lieblingspläne und starte sie mit einem Tipp.',
  'workout.emptyText': 'In diesem Ordner gibt es keine Trainingspläne.',
  'workout.routineMetaOne': '{exercises} Übung · {sets} Sätze',
  'workout.routineMetaOther': '{exercises} Übungen · {sets} Sätze',
  'workout.startRoutine': 'Plan starten',
  'workout.startRoutineOf': '{name} starten',
  'workout.supersets': 'Supersätze',

  'logger.duration': 'Dauer',
  'logger.volume': 'Volumen',
  'logger.sets': 'Sätze',
  'logger.finish': 'Beenden',
  'logger.saving': 'Speichern...',
  'logger.workoutDuration': 'Trainingsdauer',
  'logger.durationHint': 'Öffnet die Optionen für die Trainingsdauer',
  'logger.minimize': 'Training minimieren',
  'logger.menu': 'Trainingsmenü',
  'logger.finishA11y': 'Training beenden',

  'menu.close': 'Trainingsoptionen schließen',
  'menu.expandAll': 'Alle Übungen ausklappen',
  'menu.expandAllVisible': 'Alle Übungen ausklappen',
  'menu.collapseAll': 'Alle Übungen einklappen',
  'menu.collapseAllVisible': 'Alle Übungen einklappen',
  'menu.reorder': 'Übungen neu anordnen',
  'menu.reorderVisible': 'Übungen neu anordnen',
  'menu.changeGym': 'Studio wechseln · {gym}',
  'menu.changeGymA11y': 'Trainingsstudio ändern, aktuell {gym}',
  'menu.adjustTime': 'Trainingsdauer anpassen',
  'menu.adjustTimeVisible': 'Trainingszeit anpassen',
  'menu.showRpe': 'RPE-Spalte anzeigen',
  'menu.showRpeA11y': 'RPE-Spalte anzeigen',
  'menu.hideRpe': 'RPE-Spalte ausblenden',
  'menu.hideRpeA11y': 'RPE-Spalte ausblenden',
  'menu.discard': 'Training verwerfen',
  'menu.discardA11y': 'Training verwerfen',

  'rest.title': 'Pausenzeit',
  'rest.remaining': 'Verbleibende Pausenzeit',
  'rest.getReady': 'Bereit machen! ({seconds})',
  'rest.next': 'NÄCHSTES',
  'rest.increase': 'Pausenzeit um 30 Sekunden erhöhen',
  'rest.decrease': 'Pausenzeit um 30 Sekunden verringern',
  'rest.skip': 'Pause überspringen',
};

export const catalogs: Record<Locale, Record<MessageKey, string>> = { en, de };

export const DEFAULT_LOCALE: Locale = 'en';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'de'];
