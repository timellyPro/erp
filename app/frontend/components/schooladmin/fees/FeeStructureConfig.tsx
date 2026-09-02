"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Plus, Pencil, Trash2, Upload } from "lucide-react";
import SelectInput from "../../common/SelectInput";
import PrimaryButton from "../../common/PrimaryButton";
import type { Class, FeeStructure } from "./types";

interface FeeStructureConfigProps {
  classes: Class[];
  structures: FeeStructure[];
  onSuccess: () => void;
}

export default function FeeStructureConfig({
  classes,
  structures,
  onSuccess,
}: FeeStructureConfigProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalClassId, setEditingOriginalClassId] = useState<string | null>(null);
  const [structureClassId, setStructureClassId] = useState("");
  const [components, setComponents] = useState<Array<{ name: string; amount: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    updatedClasses: number;
    updated: Array<{ label: string; components: number }>;
    failed: Array<{ row: number; message: string }>;
  } | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const downloadBulkTemplate = () => {
    const rows: Record<string, string | number>[] = [];
    if (classes.length === 0) {
      rows.push({
        ClassName: "10",
        Section: "A",
        ComponentName: "Tuition Fee",
        Amount: 45000,
      });
      rows.push({
        ClassName: "10",
        Section: "A",
        ComponentName: "Lab Fee",
        Amount: 5000,
      });
    } else {
      for (const c of classes) {
        rows.push({
          ClassName: c.name,
          Section: c.section ?? "",
          ComponentName: "Tuition Fee",
          Amount: 40000,
        });
        rows.push({
          ClassName: c.name,
          Section: c.section ?? "",
          ComponentName: "Development Fee",
          Amount: 2500,
        });
      }
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Structures");
    XLSX.writeFile(wb, `fee-structure-bulk-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      alert("Please choose an Excel file (.xlsx or .xls)");
      return;
    }
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("file", bulkFile);
      const res = await fetch("/api/fees/structure/bulk", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Upload failed");
        return;
      }
      setBulkResult({
        updatedClasses: data.updatedClasses ?? 0,
        updated: data.updated ?? [],
        failed: data.failed ?? [],
      });
      setBulkFile(null);
      if (bulkInputRef.current) bulkInputRef.current.value = "";
      onSuccess();
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  const startEdit = (s: FeeStructure) => {
    setEditingId(s.id);
    setEditingOriginalClassId(s.classId);
    setStructureClassId(s.classId);
    setComponents((s.components as Array<{ name: string; amount: number }>) || []);
  };

  const startNew = () => {
    setEditingId("new");
    setEditingOriginalClassId(null);
    setStructureClassId(classes[0]?.id || "");
    // Only user-defined components count — no preset rows (avoids duplicate "Tuition" naming).
    setComponents([{ name: "", amount: 0 }]);
  };

  const handleSave = async () => {
    if (!structureClassId) return;
    if (saving) return;
    const normalizedComponents = components
      .map((c) => ({
        name: String(c.name ?? "").trim(),
        amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
      }))
      .filter((c) => c.name.length > 0 && Number.isFinite(c.amount));

    if (normalizedComponents.length === 0) {
      if (editingId !== "new") {
        const deleteClassId = editingOriginalClassId || structureClassId;
        const shouldDelete = confirm(
          "No components left. Do you want to delete this entire class fee structure?"
        );
        if (!shouldDelete) return;
        try {
          setSaving(true);
          const res = await fetch(
            `/api/fees/structure?classId=${encodeURIComponent(deleteClassId)}`,
            { method: "DELETE" }
          );
          if (!res.ok) {
            const d = await res.json();
            alert(d.message || "Failed to delete structure");
            return;
          }
          setEditingId(null);
          setEditingOriginalClassId(null);
          setStructureClassId("");
          setComponents([]);
          onSuccess();
        } catch (e) {
          console.error(e);
        } finally {
          setSaving(false);
        }
        return;
      }
      alert("Please enter valid fee components (name + numeric amount).");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/fees/structure", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: structureClassId, components: normalizedComponents }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.message || "Failed to save");
        return;
      }
      setEditingId(null);
      setEditingOriginalClassId(null);
      setStructureClassId("");
      setComponents([]);
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold mb-1">Global Fee Breakdown Configuration</h3>
          <p className="text-sm text-gray-400">
            Set the fee heads and amounts for each class. Student totals use{" "}
            <span className="text-gray-300">only the sum of these components</span>, plus any{" "}
            <span className="text-gray-300">extra fees</span> you configure below. Nothing is added on top
            automatically. Saving updates all students already in that class.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBulkOpen((v) => !v);
            if (bulkOpen) setBulkResult(null);
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10 sm:w-auto w-full"
        >
          <Upload size={16} />
          {bulkOpen ? "Close bulk upload" : "Bulk upload (Excel)"}
        </button>
      </div>

      {bulkOpen ? (
        <div className="mb-4 space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm text-gray-300">
            One row per fee head. Use columns{" "}
            <span className="font-medium text-white">ClassName</span>,{" "}
            <span className="font-medium text-white">Section</span> (blank if your class has no section),{" "}
            <span className="font-medium text-white">ComponentName</span>,{" "}
            <span className="font-medium text-white">Amount</span>. Class names must match your school
            classes exactly.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={downloadBulkTemplate}
              className="text-left text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              Download Excel template
            </button>
            <span className="hidden text-gray-600 sm:inline">·</span>
            <input
              ref={bulkInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
              className="w-full max-w-md text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              title={bulkUploading ? "Uploading..." : "Upload & apply"}
              loading={bulkUploading}
              onClick={handleBulkUpload}
            />
            {bulkFile ? (
              <span className="self-center text-xs text-gray-500">Selected: {bulkFile.name}</span>
            ) : null}
          </div>
          {bulkResult ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
              <p className="font-medium text-white">
                Updated {bulkResult.updatedClasses} class{bulkResult.updatedClasses === 1 ? "" : "es"}.
              </p>
              {bulkResult.updated.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-gray-300">
                  {bulkResult.updated.map((u) => (
                    <li key={u.label}>
                      {u.label} — {u.components} head{u.components === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              ) : null}
              {bulkResult.failed.length > 0 ? (
                <div className="mt-3 border-t border-white/10 pt-2">
                  <p className="font-medium text-amber-300">Issues ({bulkResult.failed.length})</p>
                  <ul className="mt-1 max-h-40 list-inside list-disc overflow-y-auto text-gray-400">
                    {bulkResult.failed.map((f, i) => (
                      <li key={i}>
                        {f.row > 0 ? `Row ${f.row}: ` : ""}
                        {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {structures.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">
                  Class {s.class.name}
                  {s.class.section ? `-${s.class.section}` : ""}
                </p>
                <p className="text-sm text-gray-400">
                  Total: ₹
                  {(s.components as Array<{ amount: number }>).reduce((a, c) => a + (c.amount || 0), 0)}
                </p>
              </div>
              <button
                onClick={() => startEdit(s)}
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <Pencil size={16} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={startNew}
          className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 p-4 hover:bg-white/10"
        >
          <Plus size={20} /> Add class structure
        </button>
      </div>
      {editingId && (
        <div className="border-t border-white/10 pt-4 space-y-4">
          <SelectInput
            label="Class"
            value={structureClassId}
            onChange={setStructureClassId}
            disabled={editingId !== "new"}
            options={classes.map((c) => ({
              label: `${c.name}${c.section ? `-${c.section}` : ""}`,
              value: c.id,
            }))}
          />
          <div>
            <p className="text-sm font-medium mb-2">Fee Components</p>
            {components.map((c, i) => (
              <div key={i} className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => {
                    const n = [...components];
                    n[i] = { ...n[i], name: e.target.value };
                    setComponents(n);
                  }}
                  placeholder="Component name"
                  className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={c.amount}
                  onChange={(e) => {
                    const n = [...components];
                    n[i] = { ...n[i], amount: Number(e.target.value) };
                    setComponents(n);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm sm:w-24"
                />
                <button
                  type="button"
                  onClick={() => setComponents(components.filter((_, idx) => idx !== i))}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
                  title="Remove component"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setComponents([...components, { name: "", amount: 0 }])}
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              + Add component
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <PrimaryButton
              title={saving ? "Saving..." : "Save Structure"}
              loading={saving}
              onClick={handleSave}
            />
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEditingOriginalClassId(null);
                setStructureClassId("");
                setComponents([]);
              }}
              className="px-4 py-2 rounded-xl border border-white/20"
            >
              Cancel
            </button>
            {editingId !== "new" && (
              <button
                type="button"
                onClick={async () => {
                  const deleteClassId = editingOriginalClassId || structureClassId;
                  if (!deleteClassId || !confirm("Do you really want to delete this entire class fee structure? Student amounts will be recalculated. This action cannot be undone.")) return;
                  try {
                    setDeleting(true);
                    const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(deleteClassId)}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      const d = await res.json();
                      alert(d.message || "Failed to delete");
                      return;
                    }
                    setEditingId(null);
                    setEditingOriginalClassId(null);
                    setStructureClassId("");
                    setComponents([]);
                    onSuccess();
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={saving || deleting}
                className="px-4 py-2 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete Structure"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
