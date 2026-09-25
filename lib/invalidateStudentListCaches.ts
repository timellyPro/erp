import { purgeSchoolDashboardServerCacheMatching } from "@/lib/schoolDashboardServerCache";
import { invalidateTenant } from "@/lib/tenantCache";

/** Bust student-driven caches after create/update/delete/status changes. */
export function invalidateStudentListCaches(schoolId: string): void {
  purgeSchoolDashboardServerCacheMatching(`students:list:${schoolId}`);
  purgeSchoolDashboardServerCacheMatching(`analysis:${schoolId}:`);
  purgeSchoolDashboardServerCacheMatching(`dashboard:${schoolId}:`);
  void invalidateTenant(schoolId).catch(() => {});
}
