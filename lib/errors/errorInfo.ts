/** Thrown by route handlers that need to signal a specific HTTP status (403, 400, ...) to their catch block. */
export class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export function getErrorStatusCode(err: unknown): number | undefined {
  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
  ) {
    return (err as { statusCode: number }).statusCode;
  }
  return undefined;
}

export function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return undefined;
}

export function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

export function getErrorMeta(err: unknown): unknown {
  if (err && typeof err === "object" && "meta" in err) {
    return (err as { meta?: unknown }).meta;
  }
  return undefined;
}

export function getErrorStack(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack;
  return undefined;
}

export function getErrorName(err: unknown): string | undefined {
  if (err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string") {
    return (err as { name: string }).name;
  }
  return undefined;
}

/**
 * True for errors that are safe to show a client as-is: a plain `Error` (or
 * `HttpError`) thrown directly by application code, which in this codebase's own
 * convention means a short, already-considered, user-facing message (e.g.
 * "Amount cannot exceed remaining due (₹500.00)") — not an infra/library error
 * whose message can carry internal details.
 *
 * False for anything shaped like an infra error even if it happens to be an
 * `Error` instance: Prisma client errors (constraint names, table/column names in
 * `.message`), and non-Error thrown values (a rejected promise with a plain
 * object, a raw string, etc. — application code in this repo doesn't throw those
 * intentionally, so one showing up here means something unexpected happened).
 */
function isSafeApplicationError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  // Prisma errors are all named PrismaClientXxxError and often carry `code`/`meta`
  // (constraint names, column names) baked into `.message` itself.
  if (/^PrismaClient/.test(err.name)) return false;
  if (getErrorCode(err) !== undefined) return false;
  return true;
}

/**
 * Message to return to an API client for an unexpected/uncaught error, instead of
 * unconditionally forwarding `error.message` (which can leak internal details —
 * Prisma constraint names, file paths, gateway response bodies — to whoever
 * called the route). See PRODUCTION_READINESS.md's error-handling finding.
 *
 * This deliberately still returns the real message for a plain application
 * `Error`/`HttpError` (see `isSafeApplicationError`), even outside development —
 * this codebase's convention is `throw new Error("some short user-facing
 * message")` as flow control for an expected, already-validated failure, and
 * those are written to be shown to the user. It only substitutes `fallback` for
 * errors that don't look like one of those: Prisma/infra errors, or anything not
 * an `Error` instance at all.
 */
export function toClientErrorMessage(
  err: unknown,
  fallback = "Internal server error"
): string {
  if (process.env.NODE_ENV !== "production") {
    return getErrorMessage(err) || fallback;
  }
  if (isSafeApplicationError(err)) {
    return err.message || fallback;
  }
  return fallback;
}

export function getErrorMetaTarget(err: unknown): unknown {
  if (
    err &&
    typeof err === "object" &&
    "meta" in err &&
    (err as { meta?: unknown }).meta &&
    typeof (err as { meta?: unknown }).meta === "object"
  ) {
    return (err as { meta: { target?: unknown } }).meta.target;
  }
  return undefined;
}
