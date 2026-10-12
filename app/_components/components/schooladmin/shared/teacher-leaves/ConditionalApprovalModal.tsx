import { AlertTriangle } from "lucide-react";

export function ConditionalApprovalModal({
  conditionalMessage,
  onConditionalMessageChange,
  onCancel,
  onConfirm,
  confirmDisabled,
}: {
  conditionalMessage: string;
  onConditionalMessageChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-br from-[#0b1222] to-[#101b35] rounded-2xl p-6 w-full sm:w-[420px] space-y-4">
        <h3 className="text-white text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="text-yellow-400" /> Conditional Approval
        </h3>
        <p className="text-xs text-white/50">Please specify the condition for approving this leave request. The teacher will be notified of this condition.
        </p>
        <textarea
          className="w-full h-28 rounded-xl bg-black/30 border border-yellow-500/40 p-3 text-sm text-white outline-none"
          placeholder="e.g. Must complete pending grading before leaving..."
          value={conditionalMessage}
          onChange={(e) => onConditionalMessageChange(e.target.value)}
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/10 text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="px-5 py-2 rounded-xl bg-yellow-500 text-black font-semibold disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
