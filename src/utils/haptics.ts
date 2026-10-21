/**
 * Runs a decorative haptic or animation call and intentionally ignores failures.
 *
 * Haptics are best-effort by design: devices without a motor, denied vibration
 * permissions, or web builds must never surface an error or interrupt the flow.
 * Wrapping the call here keeps that intent explicit instead of scattering empty
 * catch blocks through the UI.
 */
export function bestEffortHaptic(run: () => unknown): void {
  try {
    const result = run();
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch(() => {
        // Intentional: see function doc.
      });
    }
  } catch {
    // Intentional: see function doc.
  }
}
