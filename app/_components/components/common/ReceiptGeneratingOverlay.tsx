"use client";

import Spinner from "./Spinner";

/** Full-screen loading notice shown while a fee receipt PDF is being generated. */
export default function ReceiptGeneratingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="alertdialog"
      aria-busy="true"
      aria-label="Generating receipt"
    >
      <div className="rounded-2xl border border-white/10 bg-[#0B1220] px-8 py-6 text-center shadow-xl">
        <Spinner size={36} />
        <p className="mt-4 text-base font-semibold text-white">Generating receipt…</p>
        <p className="mt-1 text-xs text-white/60">Please wait, your receipt PDF is being prepared.</p>
      </div>
    </div>
  );
}
