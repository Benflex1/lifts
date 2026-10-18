/** Minimal shape of a dialog action needed to resolve its failure message. */
export interface DialogActionDescriptor {
  label: string;
  errorMessage?: string;
}

const GENERIC_ACTION_ERROR = 'The action could not be completed. Please try again.';

/**
 * Chooses the message shown when a dialog action rejects. Action-specific copy
 * wins, then the thrown error, then a safe generic sentence.
 */
export function getDialogActionErrorMessage(
  error: unknown,
  action: DialogActionDescriptor,
): string {
  if (action.errorMessage) return action.errorMessage;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return GENERIC_ACTION_ERROR;
}
