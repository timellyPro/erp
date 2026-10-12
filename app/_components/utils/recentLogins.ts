const STORAGE_KEY = "timelly_recent_logins";
const MAX_RECENT = 10;

export type RecentLogin = {
  email: string;
  name: string;
  userId: string;
  addedAt: number;
};

export function getRecentLogins(): RecentLogin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLogin[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentLogin(login: Omit<RecentLogin, "addedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentLogins();
    const entry: RecentLogin = { ...login, addedAt: Date.now() };
    const filtered = list.filter((l) => l.email !== login.email);
    const updated = [entry, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function removeRecentLogin(email: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentLogins().filter((l) => l.email !== email);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}
