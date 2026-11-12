"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, UserCheck, UserX } from "lucide-react";

interface Props {
  isOpen: boolean;
  userName: string;
  /** The status the user will have after confirming. */
  nextStatus: "Active" | "Inactive";
  /** blockLogin is only true when making a teacher Inactive and the box was ticked. */
  onConfirm: (blockLogin: boolean) => Promise<void>;
  onCancel: () => void;
}

/** Confirmation popup for making a teacher Active or Inactive (same look as DeleteConfirmation). */
export default function StatusChangeConfirmation({ isOpen, userName, nextStatus, onConfirm, onCancel }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockLogin, setBlockLogin] = useState(false);
  const makeInactive = nextStatus === "Inactive";

  const close = () => {
    setError(null);
    setWorking(false);
    setBlockLogin(false);
    onCancel();
  };

  const confirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm(makeInactive && blockLogin);
      setWorking(false);
      setBlockLogin(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status.");
      setWorking(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-[#0F172A] rounded-2xl shadow-2xl max-w-md w-full border border-white/10 p-6">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${
                  makeInactive ? "bg-amber-400/10" : "bg-lime-400/10"
                }`}
              >
                {makeInactive ? (
                  <UserX size={20} className="text-amber-400" />
                ) : (
                  <UserCheck size={20} className="text-lime-400" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-white text-center">
                {makeInactive ? "Make teacher inactive" : "Make teacher active"}
              </h3>
              <div className="px-6 py-4 space-y-4">
                <p className="text-gray-400 text-center text-sm">
                  Do you want to make{" "}
                  <span className="text-white font-semibold">{userName}</span>{" "}
                  {makeInactive ? "inactive" : "active"}?
                </p>
                {makeInactive && (
                  <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blockLogin}
                      onChange={(e) => setBlockLogin(e.target.checked)}
                      disabled={working}
                      className="mt-0.5 h-4 w-4 accent-amber-400"
                    />
                    <span className="text-sm text-gray-300">
                      Also block this teacher from signing in
                      <span className="block text-xs text-gray-500 mt-0.5">
                        They are signed out within about 5 minutes. Making them active again lifts the block.
                      </span>
                    </span>
                  </label>
                )}
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/30">
                    <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-300">{error}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={close}
                  disabled={working}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-medium rounded-xl transition-all border border-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={working}
                  className={`flex-1 py-2.5 font-bold rounded-xl shadow-lg transition-all disabled:opacity-60 ${
                    makeInactive
                      ? "bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20"
                      : "bg-lime-400 hover:bg-lime-500 text-black shadow-lime-400/20"
                  }`}
                >
                  {working ? "Working..." : makeInactive ? "Make Inactive" : "Make Active"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
