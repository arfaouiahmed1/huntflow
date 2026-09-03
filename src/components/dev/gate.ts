/**
 * Pure specification of the development-diagnostics gate.
 *
 * `DevDiagnostics` mirrors this decision with inline literal comparisons so
 * Next.js can replace `process.env.*` at build time and eliminate the
 * diagnostic imports from production bundles. This module is the tested,
 * readable source of truth for that contract; keep both in sync.
 */
export const DEV_DIAGNOSTICS_NODE_ENV = "development";

export const DEV_DIAGNOSTICS_DISABLE_FLAG = "1";

export interface DevDiagnosticsEnvironment {
  /** Value of `process.env.NODE_ENV` at runtime or build time. */
  readonly nodeEnv: string | undefined;
  /** Value of `process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS`. */
  readonly disableFlag: string | undefined;
}

export function shouldInitializeDevDiagnostics(
  environment: DevDiagnosticsEnvironment,
): boolean {
  return (
    environment.nodeEnv === DEV_DIAGNOSTICS_NODE_ENV &&
    environment.disableFlag !== DEV_DIAGNOSTICS_DISABLE_FLAG
  );
}
