import { useState } from "react";
import { baseComponentIndexFromHead, type HeadCard } from "./feesBreakdownHelpers";

const normalizeStructureComponentsForSave = (
  raw: Array<{ name: unknown; amount: unknown }>
): Array<{ name: string; amount: number }> =>
  raw
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim() : String(c.name ?? "").trim(),
      amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
    }))
    .filter((c) => c.name.length > 0 && Number.isFinite(c.amount));

const persistClassFeeStructure = async (
  targetClassId: string,
  rawComponents: Array<{ name: unknown; amount: unknown }>
) => {
  const normalized = normalizeStructureComponentsForSave(rawComponents);
  if (normalized.length === 0) {
    const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(targetClassId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Failed to remove fee structure");
    }
    return;
  }
  const res = await fetch("/api/fees/structure", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ classId: targetClassId, components: normalized }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "Failed to save fee structure");
  }
};

const fetchClassStructureRows = async (
  targetClassId: string
): Promise<Array<{ name: unknown; amount: unknown }>> => {
  const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(targetClassId)}`, {
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "Could not load fee structure");
  }
  const structures = Array.isArray(data.structures) ? data.structures : [];
  const s = structures.find((x: { classId: string }) => x.classId === targetClassId);
  return Array.isArray(s?.components) ? s.components : [];
};

export function useBaseFeeHeadEditing({
  classId,
  onFeeModified,
}: {
  classId: string | null;
  onFeeModified?: () => void;
}) {
  const [baseHeadBusyKey, setBaseHeadBusyKey] = useState<string | null>(null);
  const [editBaseHead, setEditBaseHead] = useState<{
    classId: string;
    componentIndex: number;
    name: string;
    amount: string;
  } | null>(null);
  const [editBaseError, setEditBaseError] = useState("");
  const [baseStructureMutating, setBaseStructureMutating] = useState(false);

  const editBaseFeeHead = async (h: HeadCard) => {
    if (!classId) {
      alert(
        "This student has no class assigned. Class fee heads can only be edited when the student is in a class."
      );
      return;
    }
    const idx = baseComponentIndexFromHead(h);
    if (idx === null) return;
    setEditBaseError("");
    setBaseHeadBusyKey(h.key);
    try {
      const rows = await fetchClassStructureRows(classId);
      const row = rows[idx] as { name?: unknown; amount?: unknown } | undefined;
      if (!row) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        return;
      }
      setEditBaseHead({
        classId,
        componentIndex: idx,
        name: typeof row.name === "string" ? row.name : String(row.name ?? ""),
        amount: String(typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0)),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not load fee structure.");
    } finally {
      setBaseHeadBusyKey(null);
    }
  };

  const deleteBaseFeeHead = async (h: HeadCard) => {
    if (!classId) {
      alert(
        "This student has no class assigned. Class fee heads can only be removed when the student is in a class."
      );
      return;
    }
    const idx = baseComponentIndexFromHead(h);
    if (idx === null) return;
    const feeTitle = h.label;
    if (
      !confirm(
        `Remove "${feeTitle}" from the class fee structure?\n\nThis updates the global breakdown for every student in this class, not only this student.`
      )
    ) {
      return;
    }
    setBaseHeadBusyKey(h.key);
    setBaseStructureMutating(true);
    try {
      const rows = await fetchClassStructureRows(classId);
      if (idx < 0 || idx >= rows.length) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        return;
      }
      const next = rows.filter((_, i) => i !== idx);
      await persistClassFeeStructure(classId, next);
      onFeeModified?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBaseStructureMutating(false);
      setBaseHeadBusyKey(null);
    }
  };

  const handleSaveEditBaseHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBaseHead) return;
    setEditBaseError("");
    const name = editBaseHead.name.trim();
    const amt = Number(editBaseHead.amount);
    if (!name) {
      setEditBaseError("Please enter a fee name.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditBaseError("Please enter a valid positive amount.");
      return;
    }
    setBaseStructureMutating(true);
    try {
      const rows = await fetchClassStructureRows(editBaseHead.classId);
      if (editBaseHead.componentIndex < 0 || editBaseHead.componentIndex >= rows.length) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        setEditBaseHead(null);
        return;
      }
      const next = rows.map((c, i) =>
        i === editBaseHead.componentIndex
          ? { name, amount: amt }
          : {
              name: typeof c.name === "string" ? c.name : String(c.name ?? ""),
              amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
            }
      );
      await persistClassFeeStructure(editBaseHead.classId, next);
      setEditBaseHead(null);
      onFeeModified?.();
    } catch (err) {
      setEditBaseError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBaseStructureMutating(false);
    }
  };

  return {
    baseHeadBusyKey,
    editBaseHead,
    setEditBaseHead,
    editBaseError,
    baseStructureMutating,
    editBaseFeeHead,
    deleteBaseFeeHead,
    handleSaveEditBaseHead,
  };
}
