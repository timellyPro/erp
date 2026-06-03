/** sessionStorage marker: superadmin must re-auth on a fresh browser session or new day. */
export const SUPERADMIN_BROWSER_SESSION_KEY = "timelly_superadmin_session";
export const SUPERADMIN_LOGIN_IN_PROGRESS_KEY = "timelly_superadmin_login_in_progress";

function todayKey(): string {
  return new Date().toDateString();
}

export function markSuperAdminBrowserSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SUPERADMIN_BROWSER_SESSION_KEY, todayKey());
}

export function clearSuperAdminBrowserSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SUPERADMIN_BROWSER_SESSION_KEY);
  sessionStorage.removeItem(SUPERADMIN_LOGIN_IN_PROGRESS_KEY);
}

export function setSuperAdminLoginInProgress(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SUPERADMIN_LOGIN_IN_PROGRESS_KEY, "1");
}

export function clearSuperAdminLoginInProgress(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SUPERADMIN_LOGIN_IN_PROGRESS_KEY);
}

export function isSuperAdminLoginInProgress(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SUPERADMIN_LOGIN_IN_PROGRESS_KEY) === "1";
}

/** Valid only for today's browser tab session (cleared when tab/browser closes). */
export function hasSuperAdminBrowserSession(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SUPERADMIN_BROWSER_SESSION_KEY) === todayKey();
}

/**
 * True when a persisted superadmin cookie exists but this browser session
 * has not completed login today (stale cookie from a previous day/session).
 */
export function shouldForceSuperAdminRelogin(): boolean {
  if (isSuperAdminLoginInProgress()) return false;
  return !hasSuperAdminBrowserSession();
}
