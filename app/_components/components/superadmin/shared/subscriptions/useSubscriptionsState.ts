import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "@/app/_components/hooks/useDebounce";
import type { BillingMode, SubscriptionRow } from "../../Subscriptions";
import { fetchSuperadminSchools, updateSchoolSubscription } from "@/lib/api/superadminSchools";

type SchoolListItem = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  billingMode?: string | null;
  parentSubscriptionAmount?: unknown;
  parentSubscriptionTrialDays?: unknown;
  isActive?: unknown;
};

export function useSubscriptionsState() {
  const router = useRouter();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);

  const fetchSchools = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const { ok, data } = await fetchSuperadminSchools(params);
      if (!ok) {
        throw new Error(data.message || "Failed to load schools");
      }
      const list = ((data.schools ?? []) as SchoolListItem[]).map((s) => ({
        id: s.id,
        name: s.name,
        location: s.location,
        createdAt: s.createdAt,
        billingMode: (s.billingMode ?? "PARENT_SUBSCRIPTION") as BillingMode,
        parentSubscriptionAmount:
          typeof s.parentSubscriptionAmount === "number" ? s.parentSubscriptionAmount : null,
        parentSubscriptionTrialDays:
          typeof s.parentSubscriptionTrialDays === "number" ? s.parentSubscriptionTrialDays : 0,
        isActive: typeof s.isActive === "boolean" ? s.isActive : true,
      }));
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading subscriptions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchools(debouncedSearch);
  }, [debouncedSearch, fetchSchools]);

  const handleSave = async (
    id: string,
    patch: Partial<
      Pick<
        SubscriptionRow,
        "name" | "billingMode" | "parentSubscriptionAmount" | "parentSubscriptionTrialDays" | "isActive"
      >
    >
  ) => {
    setSavingId(id);
    setError(null);
    try {
      const { ok, data } = await updateSchoolSubscription(id, patch);
      if (!ok) {
        throw new Error(data.message || "Failed to update subscription");
      }
      const u = data.school!;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                name: u.name ?? r.name,
                billingMode: (u.billingMode ?? "PARENT_SUBSCRIPTION") as BillingMode,
                parentSubscriptionAmount:
                  typeof u.parentSubscriptionAmount === "number" ? u.parentSubscriptionAmount : null,
                parentSubscriptionTrialDays:
                  typeof u.parentSubscriptionTrialDays === "number" ? u.parentSubscriptionTrialDays : 0,
                isActive: typeof u.isActive === "boolean" ? u.isActive : true,
              }
            : r
        )
      );
      void fetchSchools(debouncedSearch);
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error updating subscription");
    } finally {
      setSavingId(null);
    }
  };

  const handleModalSave = async () => {
    if (!editing) return;
    await handleSave(editing.id, {
      name: editing.name,
      billingMode: editing.billingMode,
      parentSubscriptionAmount: editing.parentSubscriptionAmount ?? null,
      parentSubscriptionTrialDays: editing.parentSubscriptionTrialDays ?? 0,
      isActive: editing.isActive,
    });
    setEditing(null);
  };

  return {
    rows,
    loading,
    error,
    search,
    setSearch,
    savingId,
    editing,
    setEditing,
    handleModalSave,
  };
}
