"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, X, XCircle } from "lucide-react";
import { downloadBulkStudentTemplateXlsx } from "@/lib/bulkStudentTemplateXlsx";

type Props = {
  uploadFile: File | null;
  onFileChange: (file: File | null) => void;
  uploading: boolean;
  onCancel: () => void;
  onUpload: () => Promise<{
    createdCount?: number;
    failedCount?: number;
    failed?: { row?: number; error?: string }[];
  } | void>;
};

export default function UploadCsvPanel({
  uploadFile,
  onFileChange,
  uploading,
  onCancel,
  onUpload,
}: Props) {
  const downloadTemplate = useCallback(() => {
    downloadBulkStudentTemplateXlsx();
  }, []);

  const formatUploadError = (message?: string) => {
    const text = (message || "").trim();
    const normalized = text.toLowerCase();
    if (normalized.includes("student name and timelly id already exist")) {
      return "Student with same name and Timelly ID already exists.";
    }
    if (normalized.includes("timelly id already exists")) {
      return "Timelly ID already exists.";
    }
    if (normalized.includes("aadhaar number already exists in another school")) {
      return "Aadhaar number already exists in another school.";
    }
    return text || "Something went wrong.";
  };

  const [result, setResult] = useState<{
    createdCount?: number;
    failedCount?: number;
    failed?: { row?: number; error?: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    setError(null);
    setResult(null);
    try {
      const uploadResult = await onUpload();
      if (uploadResult) {
        setResult(uploadResult);
      }
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : "Something went wrong. Please try again.";
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn p-4">
      <div className="bg-[#0F172A] rounded-2xl shadow-2xl max-w-lg w-full animate-scaleIn border border-white/10">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="text-lg md:text-xl font-bold text-gray-100">Bulk upload students</div>
          <button type="button" onClick={onCancel} className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <label className="block w-full rounded-2xl border border-dashed border-white/20 bg-[#1a2a46] hover:bg-[#223150] p-9 text-center cursor-pointer transition-all">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                onFileChange(e.target.files?.[0] || null);
                setError(null);
                setResult(null);
              }}
            />
            {uploadFile && (
              <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-lime-400 transition-all cursor-pointer bg-white/5">
                <FileSpreadsheet className="w-6 h-6 " />
                <div className="text-left">
                  <p className="font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-[#808080]">
                    {(uploadFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
            )}
            {!uploadFile && (
              <div className="flex flex-col items-center gap-2 text-[#8b9ab3]">
                <Upload className="w-9 h-9" />
                <div className="text-center">
                  <p className="font-semibold text-white">Click to upload or drag and drop</p>
                  <p className="text-xs mt-1">CSV or Excel (max. 10MB)</p>
                </div>
              </div>
            )}
          </label>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-2">
            <p className="text-xs text-blue-300">
              <strong className="text-[#8fd3ff]">Note:</strong> Same layout as admission bulk export: required fields include First Name, Last Name, Parent Name, Parent Phone, Aadhar No, and Date of Birth. Optional leading columns{" "}
              <strong className="text-white/90">Timelly ID</strong>, <strong className="text-white/90">PEN Number</strong>, and <strong className="text-white/90">APAAR ID</strong> (roll number, or e.g.{" "}
              <code className="text-lime-300/90">ADM/2026/123</code> → <code className="text-lime-300/90">123</code>).
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Download Excel template
            </button>
          </div>

          {result && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Upload Complete!</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <p className="text-xs text-[#808080] mb-1">Successfully Created</p>
                  <p className="text-lg font-bold text-green-400">{result.createdCount || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-[#808080] mb-1">Failed</p>
                  <p
                    className={`text-lg font-bold ${
                      result.failedCount ? "text-yellow-400" : "text-[#808080]"
                    }`}
                  >
                    {result.failedCount || 0}
                  </p>
                </div>
              </div>
              {Array.isArray(result.failed) && result.failed.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="text-xs text-yellow-300 mb-2">Failed rows</p>
                  <div className="max-h-36 overflow-auto space-y-1 pr-1">
                    {result.failed.slice(0, 5).map((item, idx) => (
                      <p key={`${item.row ?? idx}-${idx}`} className="text-xs text-yellow-200">
                        {`Row ${item.row ?? "-"}: ${formatUploadError(item.error)}`}
                      </p>
                    ))}
                    {result.failed.length > 5 && (
                      <p className="text-[11px] text-yellow-300/80">
                        +{result.failed.length - 5} more failed rows
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 flex items-center gap-2 text-red-400"
            >
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </motion.div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 md:px-6 py-2.5 border border-white/10 rounded-xl 
              text-gray-400 font-medium hover:bg-white/5 transition-all text-sm"
            >
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              whileHover={{ scale: uploadFile && !uploading ? 1.02 : 1 }}
              whileTap={{ scale: uploadFile && !uploading ? 0.98 : 1 }}
              className="flex-1 rounded-xl bg-lime-400 px-5 py-2.5 text-sm font-semibold
               text-black hover:bg-lime-300 disabled:opacity-60 disabled:cursor-not-allowed
                shadow-[0_0_18px_rgba(163,230,53,0.25)] flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload"
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
