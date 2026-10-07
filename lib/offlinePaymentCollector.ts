import type { Session } from "next-auth";

export type OfflinePaymentCollector = {
  collectedByUserId: string;
  collectedByName: string;
};

/** Resolve the logged-in staff member who is recording an offline fee payment. */
export function resolveOfflinePaymentCollectorFromSession(
  session: Session | null
): OfflinePaymentCollector | null {
  const userId = session?.user?.id;
  if (!userId) return null;

  const name =
    (session.user.name || "").trim() ||
    (session.user.email || "").trim() ||
    "Staff";

  return { collectedByUserId: userId, collectedByName: name };
}
