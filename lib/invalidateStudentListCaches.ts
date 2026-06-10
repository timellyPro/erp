import { purgeSchoolDashboardServerCacheMatching } from "@/lib/schoolDashboardServerCache";
import { invalidateTenant } from "@/lib/tenantCache";

/** Bust student list + count caches after create/update/delete. */
export function invalidateStudentListCaches(schoolId: string): void {
  purgeSchoolDashboardServerCacheMatching(`students:list:${schoolId}`);
  void invalidateTenant(schoolId).catch(() => {});
}
