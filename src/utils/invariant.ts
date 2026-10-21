/**
 * ARCH-11: small contract helpers for storage boundaries.
 */

/** Narrows a possibly-missing query result, failing loudly with context. */
export function requireDefined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be defined`);
  }
  return value;
}

/** Normalizes a caught unknown into a message for logs and dialog text. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Normalizes a caught unknown into an Error (used by state that stores errors). */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorMessage(error));
}
