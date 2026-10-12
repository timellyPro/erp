import { X } from "lucide-react";
import { certificateTypes } from "./parentCertificatesHelpers";

export function RequestCertificateModal({
  requestLoading,
  onClose,
  message,
  certificateType,
  setCertificateType,
  requestReason,
  setRequestReason,
  onSubmit,
}: {
  requestLoading: boolean;
  onClose: () => void;
  message: { text: string; type: "success" | "error" } | null;
  certificateType: string;
  setCertificateType: (v: string) => void;
  requestReason: string;
  setRequestReason: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !requestLoading && onClose()}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-[#0B1B34] border border-white/10 shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">Request Certificate</h3>
          <button
            type="button"
            onClick={() => !requestLoading && onClose()}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          className="flex flex-col flex-1 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="p-6 space-y-4">
            {message && (
              <div
                className={`px-4 py-3 rounded-xl text-sm ${
                  message.type === "success"
                    ? "bg-lime-400/20 text-lime-400 border border-lime-400/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}
              >
                {message.text}
              </div>
            )}
            <div>
              <label htmlFor="certificate-type" className="block text-sm font-medium text-gray-400 mb-2">
                Certificate type <span className="text-red-400">*</span>
              </label>
              <select
                id="certificate-type"
                value={certificateType}
                onChange={(e) => setCertificateType(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#A3E635]/50 focus:border-[#A3E635]"
              >
                <option value="" className="text-gray-700 bg-white">Select type</option>
                {certificateTypes.map((opt) => (
                  <option key={opt.value} value={opt.value} className="text-white bg-gray-900">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="request-reason" className="block text-sm font-medium text-gray-400 mb-2">
                Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                id="request-reason"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                required
                rows={4}
                placeholder="Brief reason for requesting this certificate..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#A3E635]/50 focus:border-[#A3E635] resize-none"
              />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-white/10 bg-[#0F172A]/80">
            <button
              type="button"
              onClick={onClose}
              disabled={requestLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-gray-300 hover:bg-white/15 disabled:opacity-50 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={requestLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-[#A3E635] text-black font-semibold hover:bg-[#A3E635]/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {requestLoading ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
