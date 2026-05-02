"use client";

import { LayoutList } from "lucide-react";
import { motion } from "framer-motion";

const FEES_SECTIONS: { id: string; label: string }[] = [
  { id: "fees-section-overview", label: "Overview / Summary" },
  { id: "fees-section-offline-payment", label: "Offline Payment Entry" },
  { id: "fees-section-add-extra-fees", label: "Add Extra Fees" },
  { id: "fees-section-fee-structure", label: "Global Fee Breakdown Configuration" },
  { id: "fees-section-extra-fees-catalog", label: "Listed Extra Fees" },
  { id: "fees-section-transactions", label: "Transactions & Refunds" },
  { id: "fees-section-student-fee-records", label: "Student-wise Fee Details" },
];

export default function FeesSectionNav() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-3 z-20 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-2xl sm:p-5"
      aria-label="Jump to fees section"
    >
      <div className="mb-3 flex flex-col gap-3 border-b border-white/10 pb-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-lime-400/25 bg-lime-400/10"
            aria-hidden
          >
            <LayoutList className="h-[18px] w-[18px] text-lime-400" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white sm:text-base">Quick navigation</p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/55">
              Jump to a section — scrolls horizontally on smaller screens.
            </p>
          </div>
        </div>
      </div>

      <div className="relative rounded-xl border border-white/[0.06] bg-black/20 p-1.5 sm:p-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] sm:gap-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-lime-400/25 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/5">
          {FEES_SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className="group shrink-0 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-[11px] font-semibold text-white/90 shadow-sm transition-colors duration-150 hover:border-lime-500/40 hover:bg-lime-500/[0.12] hover:text-lime-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:px-3.5 sm:py-2.5 sm:text-xs"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </motion.nav>
  );
}
