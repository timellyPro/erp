import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { Class, FeeStructure } from "../../types";
import {
  deleteFeeStructure,
  saveFeeStructure,
  uploadFeeStructureBulk,
} from "@/lib/api/feeStructure";

export function useFeeStructureConfigState({
  classes,
  onSuccess,
}: {
  classes: Class[];
  onSuccess: () => void;
}) {
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
      const { ok, data } = await uploadFeeStructureBulk(bulkFile);
      if (!ok) {
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

  const cancelEdit = () => {
    setEditingId(null);
    setEditingOriginalClassId(null);
    setStructureClassId("");
    setComponents([]);
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
          const { ok, data: d } = await deleteFeeStructure(deleteClassId);
          if (!ok) {
            alert(d.message || "Failed to delete structure");
            return;
          }
          cancelEdit();
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
      const { ok, data: d } = await saveFeeStructure(structureClassId, normalizedComponents);
      if (!ok) {
        alert(d.message || "Failed to save");
        return;
      }
      cancelEdit();
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const deleteClassId = editingOriginalClassId || structureClassId;
    if (!deleteClassId || !confirm("Do you really want to delete this entire class fee structure? Student amounts will be recalculated. This action cannot be undone.")) return;
    try {
      setDeleting(true);
      const { ok, data: d } = await deleteFeeStructure(deleteClassId);
      if (!ok) {
        alert(d.message || "Failed to delete");
        return;
      }
      cancelEdit();
      onSuccess();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return {
    editingId,
    structureClassId,
    setStructureClassId,
    components,
    setComponents,
    saving,
    deleting,
    bulkOpen,
    setBulkOpen,
    bulkFile,
    setBulkFile,
    bulkUploading,
    bulkResult,
    setBulkResult,
    bulkInputRef,
    downloadBulkTemplate,
    handleBulkUpload,
    startEdit,
    startNew,
    cancelEdit,
    handleSave,
    handleDelete,
  };
}
