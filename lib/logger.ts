/**
 * Minimal structured logger for server-side code (API routes, lib/, scripts,
 * socket-server, middleware). No new dependency — wraps console under the
 * hood, so this is a drop-in replacement: logger.error/warn/info accept the
 * same variadic args as console.error/warn/log. What changes is every line
 * now carries a level and an ISO timestamp, and in production it's emitted
 * as single-line JSON so log aggregators (Vercel's log drain, Datadog, etc.)
 * can parse and filter by level instead of grepping raw text.
 *
 * NOT for client components — browser console.log for UI debugging is a
 * different concern and is left alone.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return { name: arg.name, message: arg.message, stack: arg.stack };
  }
  return arg;
}

function emit(level: LogLevel, args: unknown[]) {
  const isProd = process.env.NODE_ENV === "production";
  const time = new Date().toISOString();
  const method = level === "debug" ? "log" : level;

  if (isProd) {
    const [message, ...rest] = args;
    const entry = {
      level,
      time,
      message: typeof message === "string" ? message : "",
      ...(typeof message !== "string" ? { args: args.map(serializeArg) } : {}),
      ...(rest.length ? { context: rest.map(serializeArg) } : {}),
    };
     
    console[method](JSON.stringify(entry));
    return;
  }

   
  console[method](`[${time}] ${level.toUpperCase()}`, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
