import { Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { Column } from "../../../../types/superadmin";
import type { BillingMode, SubscriptionRow } from "../../Subscriptions";

export function ModeBadge({ mode }: { mode: BillingMode }) {
  return (
    <div className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-white/15 bg-white/5 max-w-full">
      {mode === "SCHOOL_PAID" ? (
        <>
          <ToggleRight className="w-3.5 h-3.5 text-lime-300 shrink-0" />
          <span className="text-white/80 truncate">School Paid</span>
        </>
      ) : (
        <>
          <ToggleLeft className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="text-white/80 truncate">Parent Sub</span>
        </>
      )}
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${
        active
          ? "bg-emerald-500/10 border-emerald-400/40 text-emerald-300"
          : "bg-red-500/10 border-red-400/40 text-red-300"
      }`}
    >
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

export function buildSubscriptionsColumns({
  onEdit,
}: {
  onEdit: (r: SubscriptionRow) => void;
}): Column<SubscriptionRow>[] {
  return [
    {
      header: "School",
      render: (r) => (
        <div className="flex flex-col min-w-0">
          <span className="text-white font-medium wrap-break-word">{r.name}</span>
          <span className="text-xs text-white/50">{r.location || "—"}</span>
        </div>
      ),
    },
    {
      header: "Created",
      align: "center",
      render: (r) => (
        <span className="text-xs text-white/60 whitespace-nowrap">
          {new Date(r.createdAt).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      header: "Mode",
      align: "center",
      render: (r) => (
        <div className="flex justify-center">
          <ModeBadge mode={r.billingMode} />
        </div>
      ),
    },
    {
      header: "Amount (₹ / year)",
      align: "center",
      render: (r) =>
        r.billingMode === "PARENT_SUBSCRIPTION" ? (
          <span className="text-white text-sm whitespace-nowrap">
            {typeof r.parentSubscriptionAmount === "number"
              ? `₹${r.parentSubscriptionAmount.toLocaleString("en-IN")}`
              : "—"}
          </span>
        ) : (
          <span className="text-white/40 text-xs">Included</span>
        ),
    },
    {
      header: "Trial",
      align: "center",
      render: (r) =>
        r.billingMode === "PARENT_SUBSCRIPTION" ? (
          <span className="text-white tabular-nums">{r.parentSubscriptionTrialDays ?? 0}d</span>
        ) : (
          <span className="text-white/40 text-xs">—</span>
        ),
    },
    {
      header: "Status",
      align: "center",
      render: (r) => (
        <div className="flex justify-center">
          <StatusPill active={r.isActive} />
        </div>
      ),
    },
    {
      header: "",
      align: "center",
      render: (r) => (
        <button
          type="button"
          onClick={() => onEdit(r)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs text-white hover:bg-white/10 whitespace-nowrap"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      ),
    },
  ];
}
