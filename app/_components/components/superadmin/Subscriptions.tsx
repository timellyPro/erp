"use client";

import { useMemo } from "react";
import { CreditCard, Search } from "lucide-react";
import PageHeader from "../common/PageHeader";
import SearchInput from "../common/SearchInput";
import TableLayout from "../common/TableLayout";
import Spinner from "../common/Spinner";
import { useSubscriptionsState, buildSubscriptionsColumns, SubscriptionMobileCard, EditSubscriptionModal } from "./shared/subscriptions";

export type BillingMode = "PARENT_SUBSCRIPTION" | "SCHOOL_PAID";

export interface SubscriptionRow {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  billingMode: BillingMode;
  parentSubscriptionAmount: number | null;
  parentSubscriptionTrialDays: number;
  isActive: boolean;
}

export default function Subscriptions() {
  const {
    rows,
    loading,
    error,
    search,
    setSearch,
    savingId,
    editing,
    setEditing,
    handleModalSave,
  } = useSubscriptionsState();

  const columns = useMemo(
    () => buildSubscriptionsColumns({ onEdit: setEditing }),
    [setEditing]
  );

  return (
    <main className="flex-1 min-w-0 w-full max-w-[1600px] mx-auto flex flex-col">
      <div className="w-full min-h-0 space-y-4 sm:space-y-6 px-0 sm:px-0">
        <PageHeader
          title="Subscriptions"
          subtitle="SaaS mode, pricing, and activation per school"
          className="rounded-2xl sm:rounded-3xl"
          rightSlot={
            <div className="w-full md:max-w-sm lg:max-w-md">
              <SearchInput
                value={search}
                onChange={setSearch}
                icon={Search}
                iconPosition="right"
                placeholder="Search by school name…"
                variant="glass"
              />
            </div>
          }
        />

        {error && (
          <div className="text-red-400 text-sm py-1 px-1" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Mobile & tablet: cards */}
            <div className="lg:hidden space-y-3">
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-12 text-center text-sm text-white/50">
                  No schools match your search.
                </div>
              ) : (
                rows.map((r) => (
                  <SubscriptionMobileCard key={r.id} row={r} onEdit={setEditing} />
                ))
              )}
            </div>

            {/* Desktop: wide table */}
            <div className="hidden lg:block">
              <TableLayout
                columns={columns}
                data={rows}
                emptyText="No schools match your search."
                rowKey={(row) => row.id}
                tableClassName="table-auto w-full min-w-[960px]"
                tdClassName="whitespace-normal align-middle"
              />
            </div>
          </>
        )}

        <div className="mt-2 sm:mt-4 text-xs text-white/40 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 rounded-xl border border-white/5 bg-white/2 px-3 py-3 sm:px-4">
          <CreditCard className="w-4 h-4 shrink-0 text-white/35 mt-0.5" aria-hidden />
          <p className="leading-relaxed">
            Deactivating a school locks access for its admins, teachers, and parents. They will see a
            Timelly notice to contact support when trying to use the portal.
          </p>
        </div>
      </div>

      {editing && (
        <EditSubscriptionModal
          editing={editing}
          setEditing={setEditing}
          savingId={savingId}
          onCancel={() => setEditing(null)}
          onSave={() => void handleModalSave()}
        />
      )}
    </main>
  );
}
