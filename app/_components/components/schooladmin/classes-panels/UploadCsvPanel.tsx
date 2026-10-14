"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { uploadClassesCsv } from "@/lib/api/classes";
import SuccessPopups from "../../common/SuccessPopUps";
import { getErrorMessage } from "@/lib/errors/errorInfo";

interface UploadCsvPanelProps {
  onCancel: () => void;
  /** Called after a successful upload so the classes table can reload. */
  onSuccess?: () => void;
}

export default function UploadCsvPanel({ onCancel, onSuccess }: UploadCsvPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      const { ok, data: payload } = await uploadClassesCsv(file);

      if (!ok) {
        throw new Error(payload?.message || "Upload failed.");
      }

      const createdCount = payload?.createdCount ?? 0;
      const failedCount = payload?.failedCount ?? 0;
      setSuccessMessage(
        `Created: ${createdCount}, Failed: ${failedCount}`
      );
      setShowSuccess(true);
      setFile(null);
      onSuccess?.();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-[#0F172A]/50 rounded-2xl p-6 border border-white/10 animate-fadeIn shadow-inner">
      <div className="flex items-center gap-2 text-white font-semibold mb-4">
        <Upload size={18} className="text-lime-400" />
        Upload CSV
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        <div
          className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-center cursor-pointer hover:border-lime-400"
          onClick={handleBrowseClick}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleBrowseClick();
            }
          }}
        >
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Upload size={18} className="text-white/70" />
          </div>
          <div className="text-sm text-white/80">
            {file ? file.name : "Click to upload or drag and drop"}
          </div>
          <div className="text-xs text-white/40 mt-1">CSV file (max. 10MB)</div>
        </div>

        <div className="rounded-2xl border border-sky-300/20 bg-sky-900/10 p-4">
          <div className="text-xs font-semibold text-sky-200 mb-2">Instructions:</div>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-sky-200/80">
            <li>File must be in .csv format</li>
            <li>Required columns: Class Name, Section, Class Teacher, Max Students</li>
            <li>Ensure no duplicate entries</li>
          </ul>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="rounded-xl bg-lime-400 px-3.5 py-2 text-xs font-semibold text-black hover:bg-lime-300 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {isUploading ? "Uploading..." : "Upload File"}
        </button>
      </div>

      <SuccessPopups
        open={showSuccess}
        title="Uploaded and Added Classes Successfully"
        description={successMessage ?? undefined}
        onClose={() => setShowSuccess(false)}
      />
    </div>
  );
}
