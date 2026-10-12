"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Download, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { bulkImportUsers } from "@/lib/api/user";

interface ImportResult {
  successful: number;
  failed: number;
  errors?: string[];
}

export default function BulkImportZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (!validTypes.includes(selectedFile.type)) {
      setError("Please upload a CSV or Excel file");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const handleDownloadTemplate = () => {
    const csvContent = `name,email,role,designation,password
John Doe,john@school.com,TEACHER,Senior Teacher,Password123
Jane Smith,jane@school.com,TEACHER,Math Teacher,Password123
Admin User,admin@school.com,SCHOOLADMIN,Principal,Password123`;

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent)
    );
    element.setAttribute("download", "user-import-template.csv");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const { ok, data } = await bulkImportUsers(file);

      if (!ok) {
        throw new Error(data.message || "Upload failed");
      }

      setResult({ successful: data.successful ?? 0, failed: data.failed ?? 0, errors: data.errors });
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        whileHover={{ scale: 1.01 }}
        className={`
          relative p-8 rounded-2xl border-2 border-dashed
          transition duration-300 cursor-pointer
          ${
            isDragging
              ? "bg-lime-400/10 border-lime-400"
              : "bg-white/5 border-white/20 hover:border-white/40"
          }
        `}
      >
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />

        <div className="text-center">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex justify-center mb-4"
          >
            <div className="w-16 h-16 rounded-full bg-lime-400/20 flex items-center justify-center">
              <Upload className="text-lime-400" size={32} />
            </div>
          </motion.div>

          <h3 className="text-lg font-semibold text-white mb-2">
            {file ? file.name : "Drag and drop your file"}
          </h3>
          <p className="text-white/60 text-sm mb-4">
            {file
              ? "File selected. Ready to import."
              : "or click to browse. Supports CSV and Excel files (max 5MB)"}
          </p>

          {file && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="text-lime-400 hover:text-lime-300 text-sm font-medium transition"
            >
              Clear file
            </button>
          )}
        </div>
      </motion.div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30"
          >
            <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-300">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Summary */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-4 py-4 rounded-lg bg-white/5 border border-white/10"
          >
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="text-lime-400" size={20} />
              <h4 className="font-semibold text-white">Import Summary</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-lime-400/10 px-3 py-2 rounded-lg">
                <p className="text-white/60">Successful</p>
                <p className="text-lg font-bold text-lime-400">
                  {result.successful}
                </p>
              </div>
              <div className="bg-red-400/10 px-3 py-2 rounded-lg">
                <p className="text-white/60">Failed</p>
                <p className="text-lg font-bold text-red-400">{result.failed}</p>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-3 text-sm">
                <p className="text-white/60 mb-2">Errors:</p>
                <ul className="space-y-1 text-red-300 text-xs">
                  {result.errors.slice(0, 5).map((err, idx) => (
                    <li key={idx}>• {err}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>• +{result.errors.length - 5} more errors</li>
                  )}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <motion.button
          onClick={handleDownloadTemplate}
          whileHover={{ x: -4 }}
          className="flex-1 px-4 py-3 rounded-xl border border-white/20 bg-white/5
            text-white font-semibold hover:bg-white/10 transition
            flex items-center justify-center gap-2"
        >
          <Download size={18} />
          Download Template
        </motion.button>
        <motion.button
          onClick={handleUpload}
          disabled={!file || uploading || !!result}
          whileHover={{ x: 4 }}
          className="flex-1 px-4 py-3 rounded-xl bg-lime-400 text-black
            font-semibold hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed
            transition flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader size={18} className="animate-spin" />
              Uploading...
            </>
          ) : result ? (
            <>
              <CheckCircle size={18} />
              Import Complete
            </>
          ) : (
            <>
              <Upload size={18} />
              Upload & Process
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
