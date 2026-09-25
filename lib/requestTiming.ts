export async function withRequestTiming<T>(
  meta: { route: string; schoolId?: string | null; userId?: string | null },
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    // Structured log that can be shipped to any log drain.
    console.info("api_timing", {
      route: meta.route,
      ms,
      schoolId: meta.schoolId ?? null,
      userId: meta.userId ?? null,
    });
  }
}

