import { invalidateTenant } from "@/lib/tenantCache";
import { invalidateParentPortalServerCache } from "@/lib/parentPortalServerCache";

/** Bump tenant Redis version + clear in-process parent portal caches for a student. */
export function invalidateParentPortalCaches(opts: {
  schoolId: string;
  studentId: string;
}): void {
  const { schoolId, studentId } = opts;
  invalidateParentPortalServerCache(`parent:${studentId}:`);
  invalidateParentPortalServerCache(`parent:${schoolId}:${studentId}:`);
  void invalidateTenant(schoolId);
}
