export function canDismissGymPicker(selectingGymId: string | null): boolean {
  return selectingGymId === null;
}

export function canDismissExerciseScopeModal(saving: boolean): boolean {
  return !saving;
}
