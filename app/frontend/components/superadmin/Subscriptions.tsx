"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Pencil, Search, ToggleLeft, ToggleRight } from "lucide-react";
import PageHeader from "../common/PageHeader";
import SearchInput from "../common/SearchInput";
import TableLayout from "../common/TableLayout";
import Spinner from "../common/Spinner";
import { Column } from "../../types/superadmin";
import { useDebounce } from "@/app/frontend/hooks/useDebounce";

type BillingMode = "PARENT_SUBSCRIPTION" | "SCHOOL_PAID";

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

function ModeBadge({ mode }: { mode: BillingMode }) {
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

function StatusPill({ active }: { active: boolean }) {
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

export default function Subscriptions() {
  const router = useRouter();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);
  const [paymentGw, setPaymentGw] = useState({
    hyperpgBaseUrl: "",
    hyperpgMerchantId: "",
    hyperpgApiKey: "",
    loading: false,
    /** Only true after a successful GET — omit gateway fields from PATCH if false so we never wipe keys on load failure */
    fetchOk: false,
  });
  /** Inline status inside the edit dialog */
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSchools = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const res = await fetch(`/api/superadmin/schools?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to load schools");
      }
      const list = (data.schools ?? []).map((s: any) => ({
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

  useEffect(() => {
    if (!editing) {
      setPaymentGw({
        hyperpgBaseUrl: "",
        hyperpgMerchantId: "",
        hyperpgApiKey: "",
        loading: false,
        fetchOk: false,
      });
      return;
    }
    let cancelled = false;
    setPaymentGw((p) => ({ ...p, loading: true, fetchOk: false }));
    void fetch(`/api/superadmin/schools/${editing.id}/settings`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          settings?: {
            hyperpgBaseUrl?: string | null;
            hyperpgMerchantId?: string | null;
            hyperpgApiKey?: string | null;
          };
        };
        if (cancelled) return;
        if (!res.ok) {
          setPaymentGw((p) => ({ ...p, loading: false, fetchOk: false }));
          return;
        }
        const s = data.settings;
        /** Coerce API values — JSON null / odd shapes must not blank out existing DB strings */
        const asStr = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : String(v));
        setPaymentGw({
          hyperpgBaseUrl: asStr(s?.hyperpgBaseUrl),
          hyperpgMerchantId: asStr(s?.hyperpgMerchantId),
          hyperpgApiKey: asStr(s?.hyperpgApiKey),
          loading: false,
          fetchOk: true,
        });
      })
      .catch(() => {
        if (!cancelled) setPaymentGw((p) => ({ ...p, loading: false, fetchOk: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [editing?.id]);

  useEffect(() => {
    setModalFeedback(null);
  }, [editing?.id]);

  const handleSave = async (
    id: string,
    patch: Partial<
      Pick<
        SubscriptionRow,
        "name" | "billingMode" | "parentSubscriptionAmount" | "parentSubscriptionTrialDays" | "isActive"
      >
    > & {
      hyperpgBaseUrl?: string | null;
      hyperpgMerchantId?: string | null;
      hyperpgApiKey?: string | null;
    }
  ): Promise<{ ok: boolean; message?: string }> => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/schools/${id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      let data: { message?: string; school?: Record<string, unknown> } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : res.status === 503
              ? "Server busy or database timed out. Try again in a few seconds."
              : "Failed to update subscription";
        setError(msg);
        return { ok: false, message: msg };
      }
      const u = data.school ?? {};
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                name: (typeof u.name === "string" ? u.name : r.name) as string,
                billingMode: (u.billingMode ?? r.billingMode ?? "PARENT_SUBSCRIPTION") as BillingMode,
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
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error updating subscription";
      setError(msg);
      return { ok: false, message: msg };
    } finally {
      setSavingId(null);
    }
  };

  const columns = useMemo<Column<SubscriptionRow>[]>(
    () => [
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
            onClick={() => setEditing(r)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs text-white hover:bg-white/10 whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        ),
      },
    ],
    []
  );

  const handleModalSave = async () => {
    if (!editing || savingId === editing.id) return;
    setModalFeedback(null);
    const result = await handleSave(editing.id, {
      name: editing.name,
      billingMode: editing.billingMode,
      parentSubscriptionAmount: editing.parentSubscriptionAmount ?? null,
      parentSubscriptionTrialDays: editing.parentSubscriptionTrialDays ?? 0,
      isActive: editing.isActive,
      ...(paymentGw.fetchOk
        ? {
            hyperpgBaseUrl: paymentGw.hyperpgBaseUrl.trim() || null,
            hyperpgMerchantId: paymentGw.hyperpgMerchantId.trim() || null,
            hyperpgApiKey: paymentGw.hyperpgApiKey.trim() || null,
          }
        : {}),
    });
    if (result.ok) {
      setModalFeedback({ type: "success", text: "Saved successfully." });
      window.setTimeout(() => {
        setEditing(null);
        setModalFeedback(null);
      }, 900);
    } else {
      setModalFeedback({
        type: "error",
        text: result.message ?? "Save failed. Check your connection and try again.",
      });
    }
  };

  const modalSaving = Boolean(editing && savingId === editing.id);

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
                  <article
                    key={r.id}
                    className="rounded-2xl border border-white/10 bg-white/4 backdrop-blur-sm p-4 shadow-lg shadow-black/20"
                  >
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
                        onClick={() => setEditing(r)}
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
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscription-edit-title"
        >
          <div className="w-full sm:max-w-lg max-h-[min(92dvh,880px)] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-2xl bg-[#020617] border border-white/10 border-b-0 sm:border-b p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3 sticky top-0 bg-[#020617] pt-0 pb-2 -mt-1 z-1">
              <h2 id="subscription-edit-title" className="text-lg font-semibold text-white">
                Edit subscription
              </h2>
              <button
                type="button"
                disabled={modalSaving}
                className="text-white/60 hover:text-white text-sm shrink-0 py-1 px-2 -mr-2 disabled:opacity-40 disabled:pointer-events-none"
                onClick={() => !modalSaving && setEditing(null)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-white/60 mb-1">School name</p>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                />
              </div>

              <div>
                <p className="text-xs text-white/60 mb-1">Subscription mode</p>
                <div className="flex flex-col sm:flex-row rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEditing((prev) =>
                        prev ? { ...prev, billingMode: "SCHOOL_PAID" } : prev
                      )
                    }
                    className={`flex-1 px-3 py-2.5 text-xs rounded-lg font-medium transition ${
                      editing.billingMode === "SCHOOL_PAID"
                        ? "bg-lime-400 text-black"
                        : "text-white/70 hover:bg-white/5"
                    }`}
                  >
                    School paid
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing((prev) =>
                        prev ? { ...prev, billingMode: "PARENT_SUBSCRIPTION" } : prev
                      )
                    }
                    className={`flex-1 px-3 py-2.5 text-xs rounded-lg font-medium transition ${
                      editing.billingMode === "PARENT_SUBSCRIPTION"
                        ? "bg-lime-400 text-black"
                        : "text-white/70 hover:bg-white/5"
                    }`}
                  >
                    Parent subscription
                  </button>
                </div>
              </div>

              {editing.billingMode === "PARENT_SUBSCRIPTION" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-white/60 mb-1">Amount (₹ / year)</p>
                    <input
                      type="number"
                      min={0}
                      value={editing.parentSubscriptionAmount ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          parentSubscriptionAmount:
                            e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-white/60 mb-1">Free trial days</p>
                    <input
                      type="number"
                      min={0}
                      value={editing.parentSubscriptionTrialDays ?? 0}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          parentSubscriptionTrialDays:
                            e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                    />
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                <p className="text-xs font-semibold text-lime-300/90">HyperPG (school payments)</p>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  One API key per school handles fee checkout, order status, and refunds. Sandbox:{" "}
                  <span className="text-white/70">https://sandbox.hyperpg.in</span> · Production:{" "}
                  <span className="text-white/70">https://api.hyperpg.in</span>
                </p>
                {paymentGw.loading ? (
                  <p className="text-xs text-white/45 py-2">Loading payment settings…</p>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-white/60 mb-1">API base URL (optional)</p>
                      <input
                        type="url"
                        value={paymentGw.hyperpgBaseUrl}
                        onChange={(e) =>
                          setPaymentGw((p) => ({ ...p, hyperpgBaseUrl: e.target.value }))
                        }
                        className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                        placeholder="https://api.hyperpg.in"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-white/60 mb-1">Merchant ID</p>
                      <input
                        type="text"
                        value={paymentGw.hyperpgMerchantId}
                        onChange={(e) =>
                          setPaymentGw((p) => ({ ...p, hyperpgMerchantId: e.target.value }))
                        }
                        className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                        placeholder="HyperPG merchant id"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-white/60 mb-1">API key</p>
                      <input
                        type="text"
                        inputMode="text"
                        value={paymentGw.hyperpgApiKey}
                        onChange={(e) =>
                          setPaymentGw((p) => ({ ...p, hyperpgApiKey: e.target.value }))
                        }
                        className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                        placeholder="Paste API key"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <p className="mt-1 text-[10px] text-white/40">Plain text so the saved key always displays (superadmin only).</p>
                    </div>
                  </>
                )}
              </div>

              <div>
                <p className="text-xs text-white/60 mb-1">School status</p>
                <button
                  type="button"
                  onClick={() =>
                    setEditing((prev) =>
                      prev ? { ...prev, isActive: !prev.isActive } : prev
                    )
                  }
                  className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${
                    editing.isActive
                      ? "bg-emerald-500/10 border-emerald-400/40 text-emerald-300"
                      : "bg-red-500/10 border-red-400/40 text-red-300"
                  }`}
                >
                  {editing.isActive ? "Active" : "Deactivated"}
                </button>
              </div>
            </div>

            {modalFeedback && (
              <div
                className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
                  modalFeedback.type === "success"
                    ? "bg-emerald-500/15 border border-emerald-400/35 text-emerald-200"
                    : "bg-red-500/15 border border-red-400/35 text-red-200"
                }`}
                role="status"
              >
                {modalFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" aria-hidden />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-300" aria-hidden />
                )}
                <span className="leading-snug">{modalFeedback.text}</span>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                disabled={modalSaving}
                onClick={() => !modalSaving && setEditing(null)}
                className="w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl border border-white/15 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalSaving}
                onClick={() => void handleModalSave()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 rounded-xl bg-lime-400 text-black text-sm font-semibold hover:bg-lime-300 disabled:opacity-60 disabled:pointer-events-none min-h-[44px] sm:min-h-0"
              >
                {modalSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
