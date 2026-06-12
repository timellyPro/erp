import type { IUser } from "@/app/frontend/constants/addUserTable";
import {
  invalidateAddUserPageCache,
  listCacheKey,
  peekUserById,
  peekUserFormMeta,
  peekUserListPage,
  setUserByIdCache,
  setUserFormMetaCache,
  setUserListPageCache,
  type UserFormMeta,
  type UserListPageResult,
} from "@/lib/addUserPageClientCache";

export { invalidateAddUserPageCache, listCacheKey, peekUserFormMeta, peekUserListPage };

const listInflight = new Map<string, Promise<UserListPageResult>>();
const metaInflight = new Map<string, Promise<UserFormMeta>>();
const userInflight = new Map<string, Promise<Record<string, unknown>>>();

export async function fetchUserListPage(
  schoolId: string,
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: string;
    revalidate?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<UserListPageResult> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 10;
  const search = options.search ?? "";
  const role = options.role ?? "TEACHER";
  const key = listCacheKey(schoolId, page, pageSize, search, role);

  if (!options.revalidate) {
    const cached = peekUserListPage(key);
    if (cached) return cached;
  }

  const running = listInflight.get(key);
  if (running) return running;

  const run = (async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      role,
    });
    if (search.trim()) params.set("search", search.trim());

    const res = await fetch(`/api/user/all?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message || "Failed to load users");
    }

    const result: UserListPageResult = {
      users: Array.isArray(data.users) ? (data.users as IUser[]) : [],
      total: Number(data.total) || 0,
      page: Number(data.page) || page,
      pageSize: Number(data.pageSize) || pageSize,
    };
    setUserListPageCache(key, result);
    return result;
  })();

  listInflight.set(key, run);
  try {
    return await run;
  } finally {
    listInflight.delete(key);
  }
}

export async function fetchUserFormMeta(
  schoolId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<UserFormMeta> {
  if (!options?.revalidate) {
    const cached = peekUserFormMeta(schoolId);
    if (cached) return cached;
  }

  const running = metaInflight.get(schoolId);
  if (running) return running;

  const run = (async () => {
    const [classRes, settingsRes] = await Promise.all([
      fetch("/api/class/list?lite=1", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      }),
      fetch("/api/school/settings", {
        credentials: "include",
        cache: "no-store",
        signal: options?.signal,
      }),
    ]);

    const classData = await classRes.json().catch(() => ({}));
    const settingsData = await settingsRes.json().catch(() => ({}));

    const domain =
      typeof settingsData?.settings?.emailDomain === "string"
        ? settingsData.settings.emailDomain.trim()
        : "";

    const meta: UserFormMeta = {
      classes: Array.isArray(classData.classes) ? classData.classes : [],
      emailDomain: domain || null,
    };
    setUserFormMetaCache(schoolId, meta);
    return meta;
  })();

  metaInflight.set(schoolId, run);
  try {
    return await run;
  } finally {
    metaInflight.delete(schoolId);
  }
}

export async function fetchUserForEdit(
  schoolId: string,
  userId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<Record<string, unknown>> {
  if (!options?.revalidate) {
    const cached = peekUserById(schoolId, userId);
    if (cached) return cached;
  }

  const inflightKey = `${schoolId}:${userId}`;
  const running = userInflight.get(inflightKey);
  if (running) return running;

  const run = (async () => {
    const res = await fetch(`/api/user/${encodeURIComponent(userId)}`, {
      credentials: "include",
      cache: "no-store",
      signal: options?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message || "Failed to load user");
    }
    setUserByIdCache(schoolId, userId, data as Record<string, unknown>);
    return data as Record<string, unknown>;
  })();

  userInflight.set(inflightKey, run);
  try {
    return await run;
  } finally {
    userInflight.delete(inflightKey);
  }
}

/** Prefetch list + form metadata when navigating to add-user tab. */
export function warmAddUserPage(schoolId: string | null | undefined): void {
  if (!schoolId) return;
  if (!peekUserListPage(listCacheKey(schoolId, 1, 10, "", "TEACHER"))) {
    void fetchUserListPage(schoolId, { page: 1, pageSize: 10 }).catch(() => {});
  }
  if (!peekUserFormMeta(schoolId)) {
    void fetchUserFormMeta(schoolId).catch(() => {});
  }
}
