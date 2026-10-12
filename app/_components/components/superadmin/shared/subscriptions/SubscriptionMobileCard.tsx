import { Pencil } from "lucide-react";
import type { SubscriptionRow } from "../../Subscriptions";
import { ModeBadge, StatusPill } from "./subscriptionsColumns";

export function SubscriptionMobileCard({
  row: r,
  onEdit,
}: {
  row: SubscriptionRow;
  onEdit: (r: SubscriptionRow) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/4 backdrop-blur-sm p-4 shadow-lg shadow-black/20">
      <div className="flex gap-3 justify-between items-start min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white leading-snug wrap-break-word">
            {r.name}
          </h3>
          <p className="text-xs text-white/45 mt-0.5 line-clamp-2">
            {r.location || "No location"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEdit(r)}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-white/15 bg-white/10 text-xs font-medium text-white hover:bg-white/15 active:scale-[0.98] transition"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ModeBadge mode={r.billingMode} />
        <StatusPill active={r.isActive} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:text-sm border-t border-white/10 pt-3">
        <div>
          <dt className="text-white/45">Created</dt>
          <dd className="text-white/85 mt-0.5 tabular-nums">
            {new Date(r.createdAt).toLocaleDateString("en-IN")}
          </dd>
        </div>
        <div className="text-right sm:text-left">
          <dt className="text-white/45">Trial</dt>
          <dd className="text-white/85 mt-0.5">
            {r.billingMode === "PARENT_SUBSCRIPTION"
              ? `${r.parentSubscriptionTrialDays ?? 0} days`
              : "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-white/45">Amount (₹ / year)</dt>
          <dd className="text-white mt-0.5 font-medium">
            {r.billingMode === "PARENT_SUBSCRIPTION" ? (
              typeof r.parentSubscriptionAmount === "number" ? (
                <span className="text-lime-200/90">
                  ₹{r.parentSubscriptionAmount.toLocaleString("en-IN")}
                </span>
              ) : (
                <span className="text-white/50">Not set</span>
              )
            ) : (
              <span className="text-white/50">Included in school plan</span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}
