"use client";
import { useEffect, useMemo, useState } from "react";
import SelectInput from "../../common/SelectInput";
import PrimaryButton from "../../common/PrimaryButton";
import SecondaryButton from "../../common/SecondaryButton";
import type { Class, ExtraFee, FeeStructure, Student } from "./types";

interface OfflinePaymentFormProps {
  classes: Class[];
  structures: FeeStructure[];
  extraFees: ExtraFee[];
  students: Student[];
  onSuccess: () => void;
}

type SelectedHead =
  | { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string }
  | { headType: "EXTRA_FEE"; extraFeeId: string };

export default function OfflinePaymentForm({
  classes,
  structures,
  extraFees,
  students,
  onSuccess,
}: OfflinePaymentFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedHeads, setSelectedHeads] = useState<SelectedHead[]>([]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [refNo, setRefNo] = useState("");
  const [saving, setSaving] = useState(false);

  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [remainingFee, setRemainingFee] = useState<number>(0);
  const [dueHeads, setDueHeads] = useState<
    Array<{ key: string; headType: "BASE_COMPONENT" | "EXTRA_FEE"; label: string; dueBefore: number }>
  >([]);

  const handleSubmit = async () => {
    if (!studentId || !amount || Number(amount) <= 0) {
      alert("Select student and enter amount");
      return;
    }
    if (selectedHeads.length === 0) {
      alert("Select at least one fee head");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fees/offline-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          amount: Number(amount),
          paymentMode,
          refNo: refNo || undefined,
          selectedHeads,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to record payment");
        return;
      }
      setShowForm(false);
      setStudentId("");
      setSelectedClassId("");
      setSelectedSection("");
      setSelectedHeads([]);
      setAmount("");
      setRefNo("");
      setPaymentMode("Cash");
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  const sectionOptions = useMemo(() => {
    if (!selectedClassId) return [];
    const sections = new Set<string>();
    for (const s of students) {
      if (s.class?.id !== selectedClassId) continue;
      if (s.class?.section) sections.add(s.class.section);
    }
    return Array.from(sections).sort();
  }, [selectedClassId, students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedClassId && s.class?.id !== selectedClassId) return false;
      if (selectedSection && s.class?.section !== selectedSection) return false;
      return true;
    });
  }, [students, selectedClassId, selectedSection]);

  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === studentId) ?? null;
  }, [students, studentId]);

  const getHeadKey = (head: SelectedHead) => {
    if (head.headType === "BASE_COMPONENT") return `BASE:${head.componentIndex}`;
    return `EXTRA:${head.extraFeeId}`;
  };

  const headOptions = useMemo(() => {
    const heads: Array<{ key: string; label: string; head: SelectedHead }> = [];
    dueHeads.forEach((h) => {
      if (h.headType === "BASE_COMPONENT") {
        const raw = h.key.replace("BASE:", "");
        const componentIndex = Number(raw);
        if (!Number.isNaN(componentIndex)) {
          heads.push({
            key: h.key,
            label: h.label,
            head: {
              headType: "BASE_COMPONENT",
              componentIndex,
              componentName: h.label,
            },
          });
        }
        return;
      }
      if (h.headType === "EXTRA_FEE" && h.key.startsWith("EXTRA:")) {
        heads.push({
          key: h.key,
          label: h.label,
          head: {
            headType: "EXTRA_FEE",
            extraFeeId: h.key.slice("EXTRA:".length),
          },
        });
      }
    });
    return heads;
  }, [dueHeads]);

  const toggleHead = (head: SelectedHead) => {
    const key = getHeadKey(head);
    setSelectedHeads((prev) => {
      const exists = prev.some((h) => getHeadKey(h) === key);
      if (exists) return prev.filter((h) => getHeadKey(h) !== key);
      return [...prev, head];
    });
  };

  useEffect(() => {
    let cancelled = false;

    const loadBreakdown = async () => {
      if (!studentId) {
        setDueHeads([]);
        setRemainingFee(0);
        setBreakdownError(null);
        return;
      }

      setBreakdownLoading(true);
      setBreakdownError(null);

      try {
        const res = await fetch(`/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`);
        const data = await res.json();

        if (!res.ok) {
          if (!cancelled) setBreakdownError(data.message || "Failed to load due breakdown");
          return;
        }

        if (!cancelled) {
          setRemainingFee(Number(data.remainingFee) || 0);
          setDueHeads(Array.isArray(data.dueHeads) ? data.dueHeads : []);
        }
      } catch (e: any) {
        if (!cancelled) setBreakdownError(e?.message || "Failed to load due breakdown");
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    };

    loadBreakdown();
    return () => {
      cancelled = true;
    };
  }, [studentId, structures, extraFees]);

  const dueByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of dueHeads) m.set(h.key, Number(h.dueBefore) || 0);
    return m;
  }, [dueHeads]);

  const numericAmount = Number(amount);
  const preview = useMemo(() => {
    if (!studentId) return null;
    if (!numericAmount || numericAmount <= 0) return null;
    if (!dueHeads || dueHeads.length === 0) return null;
    if (selectedHeads.length === 0) return null;
    if (numericAmount > remainingFee + 0.01) return null;

    const all = headOptions.map((h) => ({ key: h.key, dueBefore: dueByKey.get(h.key) ?? 0 }));
    const selectedKeySet = new Set(selectedHeads.map((h) => getHeadKey(h)));
    const selected = all.filter((h) => selectedKeySet.has(h.key));
    const unselected = all.filter((h) => !selectedKeySet.has(h.key));

    const selectedDueSum = selected.reduce((s, h) => s + h.dueBefore, 0);
    const unselectedDueSum = unselected.reduce((s, h) => s + h.dueBefore, 0);

    const allocateProportional = (
      amountToAlloc: number,
      heads: Array<{ key: string; dueBefore: number }>
    ): Map<string, number> => {
      const sum = heads.reduce((s, h) => s + h.dueBefore, 0);
      const out = new Map<string, number>();
      if (amountToAlloc <= 0 || sum <= 0) return out;
      const eligible = heads.filter((h) => h.dueBefore > 0);
      if (eligible.length === 0) return out;
      let remaining = amountToAlloc;
      for (let i = 0; i < eligible.length; i++) {
        const h = eligible[i];
        const value =
          i === eligible.length - 1
            ? Math.min(remaining, h.dueBefore)
            : (amountToAlloc * h.dueBefore) / sum;
        out.set(h.key, (out.get(h.key) ?? 0) + value);
        remaining -= value;
      }
      return out;
    };

    const allocateSelected = Math.min(numericAmount, selectedDueSum);
    const spill = numericAmount - allocateSelected;

    const allocationsByKey = new Map<string, number>();
    for (const [k, v] of allocateProportional(allocateSelected, selected)) {
      allocationsByKey.set(k, v);
    }

    if (spill > 0.00001) {
      if (unselectedDueSum <= 0) return null;
      for (const [k, v] of allocateProportional(spill, unselected)) {
        allocationsByKey.set(k, (allocationsByKey.get(k) ?? 0) + v);
      }
    }

    const items = selectedHeads.map((h) => {
      const key = getHeadKey(h);
      const dueBefore = dueByKey.get(key) ?? 0;
      const dec = allocationsByKey.get(key) ?? 0;
      const dueAfter = Math.max(dueBefore - dec, 0);
      return { key, dueBefore, dec, dueAfter };
    });

    return { items };
  }, [amount, dueByKey, dueHeads.length, headOptions, numericAmount, remainingFee, selectedHeads, studentId]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4">Offline Payment Entry</h3>
      <p className="text-sm text-gray-400 mb-4">
        Record manual payments, cheque deposits, or bank transfers.
      </p>
      {!showForm ? (
        <SecondaryButton title="Record Offline Payment" onClick={() => setShowForm(true)} />
      ) : (
        <div className="space-y-4">
          <SelectInput
            label="Class"
            value={selectedClassId}
            onChange={(v) => {
              setSelectedClassId(v);
              setSelectedSection("");
              setStudentId("");
              setSelectedHeads([]);
            }}
            options={[
              { label: "Select class", value: "" },
              ...classes.map((c) => ({
                label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                value: c.id,
              })),
            ]}
          />
          <SelectInput
            label="Section"
            value={selectedSection}
            onChange={(v) => {
              setSelectedSection(v);
              setStudentId("");
              setSelectedHeads([]);
            }}
            disabled={!selectedClassId}
            options={[
              { label: "All Sections", value: "" },
              ...sectionOptions.map((sec) => ({ label: sec, value: sec })),
            ]}
          />
          <SelectInput
            label="Student"
            value={studentId}
            onChange={(v) => {
              setStudentId(v);
              setSelectedHeads([]);
            }}
            options={[
              { label: "Select student", value: "" },
              ...filteredStudents.map((s) => ({
                label: `${s.user.name || s.admissionNumber} (${s.class?.section || "-"})`,
                value: s.id,
              })),
            ]}
          />
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 bg-white/5 border-b border-white/10">
              <p className="text-sm font-semibold">Fee Heads</p>
              <p className="text-xs text-gray-400">Select which fees to reduce</p>
            </div>
            <div className="p-4 max-h-44 overflow-y-auto space-y-2">
              {headOptions.length === 0 ? (
                <p className="text-sm text-gray-500">Select class and student to load fee heads</p>
              ) : (
                headOptions.map((h) => {
                  const checked = selectedHeads.some((x) => getHeadKey(x) === h.key);
                  return (
                    <label
                      key={h.key}
                      className="flex items-center justify-between gap-3 text-sm px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer"
                    >
                      <span className="min-w-0">
                        <span className="block text-gray-200 truncate">{h.label}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">
                          Due: ₹{(dueByKey.get(h.key) ?? 0).toFixed(0).toLocaleString()}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleHead(h.head)}
                        className="rounded border-white/30 w-4 h-4 accent-lime-500"
                        disabled={!studentId}
                      />
                    </label>
                  );
                })
              )}
            </div>
          </div>
          {breakdownLoading ? (
            <p className="text-xs text-gray-500">Loading due amounts...</p>
          ) : breakdownError ? (
            <p className="text-xs text-red-400">{breakdownError}</p>
          ) : null}
          <div>
            <label className="block text-xs text-white/70 mb-1">Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white"
              placeholder="0.00"
            />
            {numericAmount > 0 && numericAmount > remainingFee + 0.01 ? (
              <p className="text-xs text-amber-400 mt-2">
                Max allowed: ₹{remainingFee.toFixed(0).toLocaleString()}
              </p>
            ) : null}
            {preview ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">Decrease Preview</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Amount: ₹{numericAmount.toFixed(0).toLocaleString()}
                </p>
                <div className="mt-3 space-y-2">
                  {preview.items.map((it) => {
                    const label = headOptions.find((h) => h.key === it.key)?.label ?? it.key;
                    return (
                      <div key={it.key} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-gray-200 truncate">{label}</span>
                        <div className="text-right">
                          <div className="text-emerald-400 font-medium">
                            -₹{it.dec.toFixed(0).toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Due after: ₹{it.dueAfter.toFixed(0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {["Cash", "Cheque", "UPI", "Bank"].map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMode(m)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  paymentMode === m ? "bg-emerald-500/30 text-emerald-400" : "bg-white/5"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-white/70 mb-1">Ref / Cheque No.</label>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton
              title={saving ? "Saving..." : "Generate Receipt & Save"}
              loading={saving}
              onClick={handleSubmit}
            />
            <button
              onClick={() => {
                setShowForm(false);
                setSelectedClassId("");
                setSelectedSection("");
                setStudentId("");
                setSelectedHeads([]);
                setAmount("");
                setRefNo("");
                setPaymentMode("Cash");
              }}
              className="rounded-xl border border-white/20 px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
