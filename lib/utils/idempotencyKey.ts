import { useRef } from "react";

/** RFC4122-ish random id, good enough as a one-time client request key (not a security token). */
function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One idempotency key per "unsaved attempt" at a mutation (e.g. a manual fee
 * payment form). Call `getOrCreate()` right before every submit so a retry of
 * the same in-flight/failed attempt reuses the same key, then call `renew()`
 * once the attempt succeeds (or the form is reset) so the *next* payment gets
 * its own fresh key instead of accidentally reusing this one.
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | null>(null);

  const getOrCreate = () => {
    if (!keyRef.current) keyRef.current = randomId();
    return keyRef.current;
  };

  const renew = () => {
    keyRef.current = null;
  };

  return { getOrCreate, renew };
}
