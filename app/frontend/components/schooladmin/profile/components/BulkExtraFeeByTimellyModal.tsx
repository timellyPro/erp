"use client";

import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
};

function toStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\.0$/, "").trim();
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function extractTimellyFromCell(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("/")) {
    const parts = t.split("/").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || "";
  }
  return t;
}

/** Map normalized header -> first matching column name in sheet */
function buildHeaderMap(headerRow: string[]) {
  const map = new Map<string, string>();
  for (const h of headerRow) {
    const n = normalizeHeader(h);
    if (!n) continue;
    if (!map.has(n)) map.set(n, h);
  }
  const find = (...aliases: string[]) => {
    for (const a of aliases) {
      const key = normalizeHeader(a);
      if (map.has(key)) return map.get(key)!;
    }
    return null;
  };

  const timellyCol =
    find("timellyid", "timelly id", "timelly", "rollno", "roll no", "roll", "student id", "timelly number", "timelly no") ||
    [...map.entries()].find(([k]) => k.includes("timelly") || k === "rollno" || k === "roll")?.[1];

  const feeNameCol =
    find("feename", "fee name", "fee", "extra fee", "description", "fee description") ||
    [...map.entries()].find(([k]) => k.includes("fee") && !k.includes("amount"))?.[1];

  const amountCol =
    find("amount", "value", "fee amount", "inr", "rupees") ||
    [...map.entries()].find(([k]) => k === "amount" || k.includes("amount"))?.[1];

  const nameCol = find("studentname", "student name", "fullname", "full name") || find("name") || null;

  return { timellyCol, feeNameCol, amountCol, nameCol };
}

function parseRowsFromSheetData(
  data: Record<string, unknown>[]
): { rows: Array<{ timellyId: string; feeName: string; amount: number }>; parseError?: string } {
  if (data.length === 0) return { rows: [], parseError: "Sheet is empty" };

  const first = data[0]!;
  const headerRow = Object.keys(first);
  const { timellyCol, feeNameCol, amountCol } = buildHeaderMap(headerRow);

  if (!timellyCol || !feeNameCol || !amountCol) {
    return {
      rows: [],
      parseError:
        "Could not detect columns. Use headers: Timelly ID (or Roll No), Fee Name, Amount.",
    };
  }

  const rows: Array<{ timellyId: string; feeName: string; amount: number }> = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i]!;
    const timellyRaw = toStr(row[timellyCol]);
    const feeName = toStr(row[feeNameCol]);
    const amountRaw = row[amountCol];

    if (!timellyRaw && !feeName && (amountRaw === "" || amountRaw === undefined)) continue;

    const timellyId = extractTimellyFromCell(timellyRaw) || timellyRaw;
    const amount =
      typeof amountRaw === "number" ? amountRaw : parseFloat(toStr(amountRaw));

    rows.push({ timellyId, feeName, amount });
  }

  if (rows.length === 0) return { rows: [], parseError: "No data rows after header" };
  return { rows };
}

/** Merge rows from every worksheet — sheet tab names are ignored. */
function parseRowsFromWorkbook(workbook: XLSX.WorkBook): {
  rows: Array<{ timellyId: string; feeName: string; amount: number }>;
  parseError?: string;
} {
  const merged: Array<{ timellyId: string; feeName: string; amount: number }> = [];
  let lastParseError: string | undefined;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (data.length === 0) continue;
    const parsed = parseRowsFromSheetData(data);
    if (parsed.parseError) {
      lastParseError = parsed.parseError;
      continue;
    }
    merged.push(...parsed.rows);
  }

  if (merged.length === 0) {
    return {
      rows: [],
      parseError: lastParseError || "No data found in any worksheet",
    };
  }
  return { rows: merged };
}

export default function BulkExtraFeeByTimellyModal({ open, onClose, onApplied }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    failed: number;
    errors: Array<{ index: number; timellyId: string; message: string }>;
  } | null>(null);

  const downloadTemplate = useCallback(() => {
    const aoa = [
      ["Timelly ID", "Fee Name", "Amount"],
      ["101", "Lab Fee", 500],
      ["ADM/2026/102", "Uniform Fee", 1200],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extra fees");
    XLSX.writeFile(wb, "bulk-extra-fees-template.xlsx");
  }, []);

  const handleSubmit = async () => {
    setLocalError(null);
    setCleanupMessage(null);
    setResult(null);
    if (!file) {
      setLocalError("Choose an Excel file first.");
      return;
    }
    setSubmitting(true);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const { rows, parseError } = parseRowsFromWorkbook(workbook);
      if (parseError) {
        setLocalError(parseError);
        return;
      }

      const res = await fetch("/api/fees/extra/bulk-by-timelly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.message || "Import failed");
        return;
      }
      setResult({
        created: data.created ?? 0,
        failed: data.failed ?? 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      if (data.created > 0) {
        onApplied();
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Failed to read file");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    setLocalError(null);
    setCleanupMessage(null);
    setResult(null);
    setCleaning(true);
    try {
      const res = await fetch("/api/fees/extra/bulk-by-timelly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cleanupDuplicates: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(data.message || "Cleanup failed");
        return;
      }
      setCleanupMessage(`Removed duplicate entries: ${data.cleanedDuplicates ?? 0}`);
      onApplied();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Failed to cleanup duplicates");
    } finally {
      setCleaning(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setLocalError(null);
    setCleanupMessage(null);
    setResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0F172A] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-100">
            <FileSpreadsheet className="h-5 w-5 text-lime-400" />
            Bulk extra fees (Timelly ID)
          </div>
          <button type="button" onClick={handleClose} className="text-white/60 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5 text-sm text-gray-300">
          <p className="text-gray-400 leading-relaxed">
            Upload an <span className="text-white/90">.xlsx</span> file. Each row adds one{" "}
            <strong className="text-white">student-level extra fee</strong> (same as Fees → Add extra fee for one
            student). Students are matched by <strong className="text-white">Timelly ID</strong> (roll number, or last
            part of admission like <code className="text-lime-300/90">ADM/2026/123</code> →{" "}
            <code className="text-lime-300/90">123</code>).
          </p>
          <ul className="list-disc pl-5 text-gray-500 space-y-1 text-xs">
            <li>Required columns: Timelly ID (or Roll No), Fee Name, Amount</li>
            <li>All worksheets in the file are merged — sheet tab names are not used</li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Download template
            </button>
            <button
              type="button"
              onClick={() => void handleCleanupDuplicates()}
              disabled={submitting || cleaning}
              className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
            >
              {cleaning ? "Cleaning duplicates..." : "Cleanup duplicate extra fees"}
            </button>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-8 text-center hover:bg-white/[0.04]">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="mx-auto mb-2 h-8 w-8 text-lime-400/80" />
            <span className="text-white/80">{file ? file.name : "Click to select Excel file"}</span>
            <span className="mt-1 text-xs text-gray-500">.xlsx or .xls</span>
          </label>

          {localError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {localError}
            </div>
          )}
          {cleanupMessage && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {cleanupMessage}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm space-y-2">
              <p className="text-lime-300 font-semibold">Created: {result.created}</p>
              {result.failed > 0 && (
                <p className="text-amber-200">Skipped / failed rows: {result.failed}</p>
              )}
              {result.errors.length > 0 && (
                <ul className="max-h-40 overflow-y-auto text-xs text-gray-400 space-y-1 border-t border-white/10 pt-2 mt-2">
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      Row {err.index}
                      {err.timellyId ? ` (${err.timellyId})` : ""}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/10 p-4 sm:flex-row sm:justify-end shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              type="button"
              disabled={submitting || !file}
              onClick={() => void handleSubmit()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-500 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
