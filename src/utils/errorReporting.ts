/**
 * Central error reporting for the app.
 *
 * `reportError` is the single entry point for failures that should not vanish:
 * it normalizes the value, keeps a bounded in-memory breadcrumb trail, forwards
 * the report to an optional sink, and logs in development builds. It never
 * throws, so it is safe to call from catch blocks and cleanup paths.
 */

export interface ErrorReportContext {
  /** Dot-separated origin, for example `workout.autosave` or `render.History`. */
  scope: string;
  [key: string]: unknown;
}

export interface ErrorBreadcrumb {
  error: Error;
  context: ErrorReportContext;
  /** Epoch milliseconds when the report was recorded. */
  at: number;
}

export type ErrorSink = (error: Error, context: ErrorReportContext) => void;

const MAX_BREADCRUMBS = 20;

const breadcrumbs: ErrorBreadcrumb[] = [];
let sink: ErrorSink | null = null;

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    // Circular or otherwise unserializable values still need a readable error.
    return new Error(String(error));
  }
}

function isDevelopmentBuild(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

export function setErrorSink(nextSink: ErrorSink | null): void {
  sink = nextSink;
}

export function getErrorBreadcrumbs(): readonly ErrorBreadcrumb[] {
  return breadcrumbs.slice();
}

export function clearErrorBreadcrumbs(): void {
  breadcrumbs.length = 0;
}

export function reportError(error: unknown, context: ErrorReportContext): Error {
  const normalized = normalizeError(error);

  breadcrumbs.push({ error: normalized, context, at: Date.now() });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }

  if (isDevelopmentBuild()) {
    console.error(`[${context.scope}]`, normalized, context);
  }

  if (sink) {
    try {
      sink(normalized, context);
    } catch {
      // Reporting must never break the caller; the breadcrumb above is already recorded.
    }
  }

  return normalized;
}
