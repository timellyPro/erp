import { CheckCircle, File, Loader2, Upload } from "lucide-react";
import type { RefObject } from "react";

export function ApproveCertificateModal({
  approvingId,
  fileInputRef,
  selectedFile,
  onFileSelect,
  actingId,
  uploadingFile,
  onApprove,
  onClose,
}: {
  approvingId: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  actingId: string | null;
  uploadingFile: boolean;
  onApprove: (id: string) => void;
  onClose: () => void;
}) {
  const busy = actingId === approvingId || uploadingFile;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Approve Certificate Request</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Attach Certificate Document (Optional)
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,image/*"
                onChange={onFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg transition"
              >
                <Upload size={16} />
                {selectedFile ? "Change File" : "Choose File"}
              </button>
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <File size={16} />
                  <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              PDF, DOC, DOCX, or image files (max 10MB)
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onApprove(approvingId)}
              disabled={busy}
              className="flex-1 px-4 py-3 bg-lime-400 text-black font-semibold rounded-lg hover:bg-lime-400/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {uploadingFile ? "Uploading..." : "Approving..."}
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Approve
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-3 bg-[#2d2d2d] text-white font-semibold rounded-lg hover:bg-[#404040] transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
