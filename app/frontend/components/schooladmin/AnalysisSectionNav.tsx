"use client";

import { BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

const BASE = "/frontend/pages/schooladmin/analysis";

const SECTIONS: { slug: string; label: string }[] = [
  { slug: "", label: "Overview & charts" },
  { slug: "gender-enrollment", label: "Gender (class / section)" },
  { slug: "admission-comparison", label: "Admission comparison" },
  { slug: "fee-collection", label: "Fee collection" },
  { slug: "fees-comparison", label: "Fees comparison" },
  { slug: "student-credentials", label: "Student credentials" },
];

function SectionPills() {
  const router = useRouter();
  const pathname = usePathname();

  const hrefFor = (slug: string) => (slug ? `${BASE}/${slug}` : BASE);

  const goTo = (slug: string) => {
    const target = hrefFor(slug);
    if (pathname !== target) router.push(target);
  };

  return (
    <div className="relative rounded-lg border border-white/[0.08] bg-black/25 p-1 sm:rounded-xl sm:p-1.5">
      <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-0.5 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] sm:gap-2 [&::-webkit-overflow-scrolling]:touch [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-sky-400/25 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/5">
        {SECTIONS.map(({ slug, label }) => {
          const target = hrefFor(slug);
          const active = pathname === target;
          return (
            <motion.button
              key={slug || "overview"}
              type="button"
              onClick={() => goTo(slug)}
              initial={{ opacity: 0, y: 4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18, delay: 0.02 }}
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`group relative shrink-0 snap-start overflow-hidden whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-center text-[11px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs ${
                active
                  ? "border-sky-400/60 bg-gradient-to-r from-sky-500/35 via-sky-400/20 to-cyan-400/20 text-sky-50"
                  : "border-white/10 bg-white/[0.04] text-white/90 hover:border-sky-500/45 hover:bg-gradient-to-r hover:from-sky-500/[0.18] hover:via-sky-400/[0.1] hover:to-cyan-400/[0.1] hover:text-sky-50"
              }`}
            >
              <span className="absolute inset-0 -translate-x-[120%] bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 group-hover:translate-x-[120%]" />
              <span className="relative z-10 block w-full text-center">{label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  /** When true, only pills (for use inside a parent header card). */
  embedded?: boolean;
};

export default function AnalysisSectionNav({ embedded = false }: Props) {
  if (embedded) {
    return (
      <nav className="w-full min-w-0" aria-label="Jump to analysis section">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-white/55">
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-sky-400/90 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]">Sections</span>
          </div>
          <span className="hidden text-[11px] text-white/40 sm:inline sm:text-xs">
            Tables open on their own page; overview shows charts.
          </span>
        </div>
        <SectionPills />
      </nav>
    );
  }

  return (
    <motion.nav
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:mb-5 sm:rounded-2xl sm:p-5"
      aria-label="Jump to analysis section"
    >
      <div className="mb-2 flex flex-col gap-2 border-b border-white/10 pb-2 sm:mb-4 sm:gap-3 sm:pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-400/10 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-hidden
          >
            <BarChart3 className="h-[18px] w-[18px] text-sky-400" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white sm:text-base">Quick navigation</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/55 sm:text-xs">
              Separate pages for each table; overview keeps charts and summary cards.
            </p>
          </div>
        </div>
      </div>
      <SectionPills />
    </motion.nav>
  );
}
