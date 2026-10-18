import { invalidateSchoolFeesPageCache } from "@/lib/fees/schoolFeesPageClientCache";
import { invalidateFeesTransactionsCache } from "@/lib/fees/feesTransactionsCache";

/**
 * Drop the browser-side school-wide fee caches (Fees page stats/records and the transactions
 * list). The student profile only clears that student's own caches after a payment or fee
 * edit, so without this the Fees page keeps showing pre-payment numbers (memory 90s, session
 * storage 30 min) until its background refresh lands.
 *
 * Called with no school id on purpose: one browser session belongs to one school, and a
 * missing session school id must not leave stale numbers behind.
 */
export function invalidateSchoolFeeClientCaches(): void {
  try {
    invalidateSchoolFeesPageCache();
    invalidateFeesTransactionsCache();
  } catch {
    /* storage unavailable: the in-memory caches were already cleared */
  }
}
