/** sessionStorage marker: superadmin must re-auth when the browser tab/session is new. */
export const SUPERADMIN_BROWSER_SESSION_KEY = "timelly_superadmin_session";

export function markSuperAdminBrowserSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SUPERADMIN_BROWSER_SESSION_KEY, "1");
}

export function clearSuperAdminBrowserSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SUPERADMIN_BROWSER_SESSION_KEY);
}

export function hasSuperAdminBrowserSession(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SUPERADMIN_BROWSER_SESSION_KEY) === "1";
}
