"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { normalizeExtraFeeResidencyScope } from "@/lib/extraFeeResidencyScope";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";

type FeeAssignRow = {
  id: string;
  name: string;
  amount: string;
  residencyScope?: string;
  splitIntoTwoInstallments?: boolean;
};
type FeeHeadOption = {
  key: string;
  name: string;
  amount: number;
  selected: boolean;
  scopeLabel: string;
  residencyScope: string;
  splitIntoTwoInstallments: boolean;
};

function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot).replace(/\D/g, "");
  const frac = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`;
}

function formatCatalogExtraScope(
  x: { targetType?: string | null; targetClassId?: string | null; targetSection?: string | null },
  classById: Map<string, string>
): string {
  const t = String(x.targetType ?? "");
  if (t === "SCHOOL") return "School-wide";
  const classLabel = x.targetClassId ? classById.get(String(x.targetClassId)) : undefined;
  if (t === "CLASS") return classLabel ? `Class ${classLabel}` : "Class-specific";
  if (t === "SECTION") {
    const sec = x.targetSection ? String(x.targetSection) : "";
    if (classLabel && sec) return `${classLabel} · section ${sec}`;
    if (classLabel) return `${classLabel} · section`;
    return "Section-specific";
  }
  return t || "—";
}

function normalizeResidencyType(value: string | null | undefined): string {
  const v = (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return "Day Scholar";
  if (v === "dayscholar" || v === "dayscholer") return "Day Scholar";
  if (v === "hostel" || v === "hostler" || v === "hosteler" || v === "hosteller" || v === "hoster") return "Hosteller";
  if (v === "rte") return "RTE";
  return value?.trim() || "Day Scholar";
}

function displayResidencyType(value: string | null | undefined): string {
  return formatResidencyTypeForDisplay(normalizeResidencyType(value));
}

function seededRows(residencyType: string | null | undefined): FeeAssignRow[] {
  const now = Date.now();
  const normalized = normalizeResidencyType(residencyType);
  if (normalized === "Hosteller") {
    return [{ id: `seed-${now}`, name: "Hostel Fee", amount: "" }];
  }
  if (normalized === "Day Scholar") {
    return [{ id: `seed-${now}`, name: "Transport Fee", amount: "" }];
  }
  return [{ id: `seed-${now}`, name: "", amount: "" }];
}

type Props = {
  studentId: string;
  studentName: string;
  classDisplayName: string;
  residencyType?: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function AssignFeeHeadsCatalogModal({
  studentId,
  studentName,
  classDisplayName,
  residencyType,
  onClose,
  onSuccess,
}: Props) {
  const [dbFeeHeadOptions, setDbFeeHeadOptions] = useState<FeeHeadOption[]>([]);
  const [feeAssignRows, setFeeAssignRows] = useState<FeeAssignRow[]>(() => seededRows(residencyType));
  const [assigningFees, setAssigningFees] = useState(false);
  const [assignFeeError, setAssignFeeError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setAssignFeeError(null);
    try {
      const [extrasRes, templatesRes, classesRes] = await Promise.all([
        fetch("/api/fees/extra", { credentials: "include", cache: "no-store" }),
        fetch("/api/fees/extra-head-templates", { credentials: "include", cache: "no-store" }),
        fetch("/api/class/list", { credentials: "include", cache: "no-store" }),
      ]);

      const classesJson = classesRes.ok ? await classesRes.json().catch(() => ({})) : {};
      const classList = Array.isArray(classesJson?.classes) ? classesJson.classes : [];
      const classById = new Map<string, string>();
      for (const c of classList as { id?: string; name?: string; section?: string | null }[]) {
        classById.set(String(c.id ?? ""), `${c.name ?? ""}${c.section ? `-${c.section}` : ""}`);
      }

      let templateHeads: FeeHeadOption[] = [];
      if (templatesRes.ok) {
        const tplJson = await templatesRes.json().catch(() => ({}));
        const tplList = Array.isArray(tplJson?.templates) ? tplJson.templates : [];
        templateHeads = tplList
          .map((x: { id?: string; name?: string; amount?: number; splitIntoTwoInstallments?: boolean }): FeeHeadOption | null => {
            const id = String(x.id ?? "");
            const name = String(x.name ?? "").trim();
            const amount = Number(x.amount ?? 0);
            if (!id || !name || !Number.isFinite(amount) || amount <= 0) return null;
            return {
              key: `template:${id}`,
              name,
              amount,
              selected: false,
              scopeLabel: "Custom saved head",
              residencyScope: normalizeExtraFeeResidencyScope("ALL"),
              splitIntoTwoInstallments: Boolean(x.splitIntoTwoInstallments),
            };
          })
          .filter((h: FeeHeadOption | null): h is FeeHeadOption => h !== null);
      }

      let catalogHeads: FeeHeadOption[] = [];
      if (extrasRes.ok) {
        const extrasJson = await extrasRes.json().catch(() => ({}));
        const allExtras = Array.isArray(extrasJson?.extraFees) ? extrasJson.extraFees : [];
        const catalogExtras = allExtras.filter((x: { targetType?: string }) =>
          ["SCHOOL", "CLASS", "SECTION"].includes(String(x?.targetType ?? ""))
        );
        catalogHeads = catalogExtras
          .map((x: Record<string, unknown>): FeeHeadOption | null => {
            const id = String(x.id ?? "");
            const name = String(x.name ?? "").trim();
            const amount = Number(x.amount ?? 0);
            if (!id || !name || !Number.isFinite(amount) || amount <= 0) return null;
            return {
              key: id,
              name,
              amount,
              selected: false,
              scopeLabel: formatCatalogExtraScope(
                {
                  targetType: x.targetType as string | null,
                  targetClassId: x.targetClassId as string | null,
                  targetSection: x.targetSection as string | null,
                },
                classById
              ),
              residencyScope: normalizeExtraFeeResidencyScope(x.residencyScope),
              splitIntoTwoInstallments: Boolean(x.splitIntoTwoInstallments),
            };
          })
          .filter((h: FeeHeadOption | null): h is FeeHeadOption => h !== null);
      }

      setDbFeeHeadOptions(
        [...templateHeads, ...catalogHeads].sort(
          (a, b) => a.name.localeCompare(b.name) || a.scopeLabel.localeCompare(b.scopeLabel)
        )
      );
    } catch {
      setDbFeeHeadOptions([]);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const addAssignFeeRow = () => {
    setFeeAssignRows((prev) => [...prev, { id: `row-${Date.now()}-${Math.random()}`, name: "", amount: "" }]);
  };

  const addSelectedDbHeadsToRows = () => {
    const selected = dbFeeHeadOptions.filter((x) => x.selected);
    if (selected.length === 0) return;
    setFeeAssignRows((prev) => [
      ...prev,
      ...selected.map((x) => ({
        id: `db-${Date.now()}-${Math.random()}`,
        name: x.name,
        amount: String(x.amount),
        residencyScope: x.residencyScope,
        splitIntoTwoInstallments: x.splitIntoTwoInstallments,
      })),
    ]);
    setDbFeeHeadOptions((prev) => prev.map((x) => ({ ...x, selected: false })));
  };

  const saveAssignedFees = async () => {
    const cleaned = feeAssignRows
      .map((r) => ({
        name: r.name.trim(),
        amount: Number(r.amount),
        residencyScope: r.residencyScope,
        splitIntoTwoInstallments: r.splitIntoTwoInstallments === true,
      }))
      .filter((r) => r.name.length > 0 && Number.isFinite(r.amount) && r.amount > 0);

    if (cleaned.length === 0) {
      setAssignFeeError("Add at least one fee with valid name and amount.");
      return;
    }

    setAssigningFees(true);
    setAssignFeeError(null);
    try {
      for (const row of cleaned) {
        const res = await fetch("/api/fees/extra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: row.name,
            amount: row.amount,
            targetType: "STUDENT",
            targetStudentId: studentId,
            residencyScope: row.residencyScope ?? "ALL",
            splitIntoTwoInstallments: row.splitIntoTwoInstallments,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || `Failed to assign ${row.name}`);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to assign fees");
    } finally {
      setAssigningFees(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[min(90vh,900px)] w-full max-w-2xl flex-col min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-xl">
        <div className="shrink-0 space-y-4 border-b border-white/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold text-white">Assign fee heads</h4>
              <p className="text-sm text-white/70">
                {studentName} · {classDisplayName} · {displayResidencyType(residencyType)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !assigningFees && onClose()}
              className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            Pick saved heads from your catalog (same as Admission → Assign Fees), or add custom rows below. Each
            selection posts as a student extra fee and increases this student&apos;s total due.
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-white/80">Fee heads catalog</div>
            {loadingCatalog ? (
              <p className="text-xs text-white/45 py-2">Loading catalog…</p>
            ) : dbFeeHeadOptions.length === 0 ? (
              <p className="text-xs text-white/45 py-1">
                No catalog heads yet. Under Fees → Add extra fees, add Custom fee heads or school / class / section
                extras.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="grid max-h-[min(42vh,16rem)] min-h-0 grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y pr-1 [-webkit-overflow-scrolling:touch] md:grid-cols-2">
                  {dbFeeHeadOptions.map((h) => (
                    <label
                      key={h.key}
                      className="flex min-h-0 items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={h.selected}
                        onChange={(e) =>
                          setDbFeeHeadOptions((prev) =>
                            prev.map((x) => (x.key === h.key ? { ...x, selected: e.target.checked } : x))
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/90">{h.name}</span>
                        <span className="block text-[10px] text-white/45 mt-0.5">
                          {h.scopeLabel}
                          {h.splitIntoTwoInstallments ? " · 2 installments" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">₹{h.amount.toLocaleString("en-IN")}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addSelectedDbHeadsToRows}
                  className="px-3 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs"
                >
                  Add selected heads
                </button>
              </div>
            )}
          </div>

          {assignFeeError ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {assignFeeError}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-5 py-4 [-webkit-overflow-scrolling:touch]">
          {feeAssignRows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_160px_90px] gap-2">
              <input
                type="text"
                value={row.name}
                onChange={(e) =>
                  setFeeAssignRows((prev) =>
                    prev.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x))
                  )
                }
                className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white text-sm"
                placeholder="Fee name"
              />
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={row.amount}
                onChange={(e) => {
                  const v = sanitizeMoneyInput(e.target.value);
                  setFeeAssignRows((prev) =>
                    prev.map((x) => (x.id === row.id ? { ...x, amount: v } : x))
                  );
                }}
                className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white text-sm"
                placeholder="Amount"
              />
              <button
                type="button"
                onClick={() => setFeeAssignRows((prev) => prev.filter((x) => x.id !== row.id))}
                className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 bg-[#0B1220] p-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={addAssignFeeRow}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm hover:bg-white/10"
          >
            + Add another fee
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !assigningFees && onClose()}
              disabled={assigningFees}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveAssignedFees()}
              disabled={assigningFees}
              className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {assigningFees && <Loader2 size={16} className="animate-spin" />}
              {assigningFees ? "Saving…" : "Save fees"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
