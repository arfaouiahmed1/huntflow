export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = "UNKNOWN",
    public readonly status = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something unexpected went wrong.";
}

export function isOffline(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND|network|timed out|abort/i.test(err.message))
  );
}

/** Wrap an async action in a typed error that surfaces the user-facing message. */
export async function guard<T>(fn: () => Promise<T>, fallbackMessage = "Operation failed."): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(toErrorMessage(err) || fallbackMessage, err instanceof Error ? err.name : "UNKNOWN");
  }
}

export function jsonError(message: string, status = 500, code = "ERROR", details?: unknown) {
  return Response.json(
    { ok: false, error: { code, message, details } },
    { status }
  );
}

export function jsonOk<T>(data: T) {
  return Response.json({ ok: true, data });
}

export async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("Invalid JSON body.", "BAD_BODY", 400);
  }
}

/** Normalize an error thrown inside an API route into a JSON response. */
export function routeError(err: unknown) {
  if (err instanceof AppError) {
    return jsonError(err.message, err.status, err.code, err.details);
  }
  if (err instanceof Error) {
    return jsonError(err.message, 500, err.name);
  }
  return jsonError("Unexpected server error.", 500);
}
