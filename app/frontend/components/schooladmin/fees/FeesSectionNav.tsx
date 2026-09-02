"use client";

import { LayoutList } from "lucide-react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { prefetchFeesSection } from "@/lib/loadSchoolFeesPage";
import type { FeesSection } from "@/lib/feesPageRequirements";

const FEES_SECTIONS: { slug: string; label: string }[] = [
  { slug: "", label: "Overview / Summary" },
  { slug: "fees-records", label: "Fees Records" },
  { slug: "petty-cash", label: "Petty Cash" },
  { slug: "offline-payment", label: "Offline Payment Entry" },
  { slug: "add-extra-fees", label: "Add Extra Fees" },
  { slug: "fee-structure", label: "Global Fee Breakdown Configuration" },
  { slug: "extra-fees-catalog", label: "Listed Extra Fees" },
  { slug: "transactions", label: "Transactions & Refunds" },
];

type FeesSectionNavProps = {
  schoolId?: string | null;
};

export default function FeesSectionNav({ schoolId }: FeesSectionNavProps) {
  const router = useRouter();
  const pathname = usePathname();

  const goTo = (slug: string) => {
    const target = slug ? `/frontend/pages/schooladmin/fees/${slug}` : "/frontend/pages/schooladmin/fees";
    if (pathname !== target) router.push(target);
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-2 z-20 rounded-xl border border-white/10 bg-white/5 p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:top-3 sm:rounded-2xl sm:p-5"
      aria-label="Jump to fees section"
    >
      <div className="mb-2 flex flex-col gap-2 border-b border-white/10 pb-2 sm:mb-4 sm:gap-3 sm:pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-lime-400/25 bg-lime-400/10 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-hidden
          >
            <LayoutList className="h-[18px] w-[18px] text-lime-400" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white sm:text-base">Quick navigation</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/55 sm:text-xs">
              Jump to a section — scrolls horizontally on smaller screens.
            </p>
          </div>
        </div>
      </div>

      <div className="relative rounded-xl border border-white/[0.06] bg-black/20 p-1.5 sm:p-2">
        <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] sm:gap-2 [&::-webkit-overflow-scrolling]:touch [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-lime-400/25 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/5">
          {FEES_SECTIONS.map(({ slug, label }) => (
            <motion.button
              key={slug || "overview"}
              type="button"
              onMouseEnter={() => {
                if (schoolId) prefetchFeesSection(schoolId, (slug || "overview") as FeesSection);
              }}
              onFocus={() => {
                if (schoolId) prefetchFeesSection(schoolId, (slug || "overview") as FeesSection);
              }}
              onClick={() => goTo(slug)}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, delay: 0.02 }}
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`group relative shrink-0 snap-start overflow-hidden whitespace-nowrap rounded-xl border px-3 py-2 text-center text-[11px] font-semibold shadow-[0_6px_16px_-10px_rgba(132,204,22,0.8)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:px-3.5 sm:py-2.5 sm:text-xs ${
                pathname === (slug ? `/frontend/pages/schooladmin/fees/${slug}` : "/frontend/pages/schooladmin/fees")
                  ? "border-lime-400/60 bg-gradient-to-r from-lime-500/35 via-lime-400/20 to-emerald-400/20 text-lime-50"
                  : "border-white/10 bg-white/[0.04] text-white/90 hover:border-lime-500/45 hover:bg-gradient-to-r hover:from-lime-500/[0.2] hover:via-lime-400/[0.12] hover:to-emerald-400/[0.12] hover:text-lime-50"
              }`}
            >
              <span className="absolute inset-0 -translate-x-[120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-[120%]" />
              <span className="relative z-10 block w-full text-center">{label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.nav>
  );
}
