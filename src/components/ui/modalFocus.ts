// Pure, DOM-free focus-trap decisions for `src/components/ui/Modal.tsx`.
//
// The test runner uses the `node` environment (no jsdom), so the trap math
// lives here where vitest can pin it. Modal.tsx wires these helpers to the
// live panel element and `document.activeElement`.

/** Focusable descendants that participate in the dialog Tab cycle. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface TrapRequest {
  /**
   * Index of the currently focused element within the dialog's focusable
   * list, or `-1` when focus sits on the dialog panel itself (`tabIndex=-1`,
   * the programmatic initial focus) or has escaped outside the dialog.
   */
  activeIndex: number;
  /** Number of focusable descendants inside the dialog. */
  count: number;
  /** True for Shift+Tab (backward cycle). */
  shiftKey: boolean;
}

/**
 * Returns the focusable index to move to, or `null` when the browser's
 * default Tab order already stays inside the dialog (no interception).
 * Callers `preventDefault()` + focus the returned index only on non-null.
 */
export function resolveTrapIndex({ activeIndex, count, shiftKey }: TrapRequest): number | null {
  if (count <= 0) return null; // No cycle members: caller holds focus on the panel.
  if (shiftKey) {
    // Backward from the first control — or from the panel/outside — wraps
    // to the last control.
    if (activeIndex <= 0) return count - 1;
    return null;
  }
  // Forward from the last control — or from the panel/outside — wraps to
  // the first control so focus can never leave via Tab.
  if (activeIndex === -1 || activeIndex === count - 1) return 0;
  return null;
}

/**
 * Guards focus restoration on dialog close/unmount: the trigger may have
 * been removed while the dialog was open (detached node) or may not be
 * focusable at all. Never throws; `false` means "leave focus alone".
 */
export function canRestoreFocus(el: unknown): el is { focus: () => void } {
  if (!el || typeof el !== "object") return false;
  const candidate = el as { focus?: unknown; isConnected?: unknown };
  if (typeof candidate.focus !== "function") return false;
  if ("isConnected" in candidate && candidate.isConnected === false) return false;
  return true;
}
