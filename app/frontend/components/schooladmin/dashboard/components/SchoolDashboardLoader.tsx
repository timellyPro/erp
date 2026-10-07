"use client";

import { useEffect, useState } from "react";

const STEPS = ["Students", "Teachers", "Attendance", "Collections"];

/** Minimal luxury loader for the school admin dashboard. */
export function SchoolDashboardLoader() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="relative flex min-h-[22rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#08080a]/50 px-8 py-14 backdrop-blur-2xl sm:min-h-[24rem] sm:py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading dashboard"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(180,244,77,0.07),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_80%,rgba(255,255,255,0.03),transparent_60%)]" />

      <div className="relative mb-10 flex h-[4.5rem] w-[4.5rem] items-center justify-center sm:h-20 sm:w-20">
        <div className="dashboard-loader-ring-outer absolute inset-0 rounded-full border border-white/[0.08]" />
        <div className="dashboard-loader-ring-spin absolute inset-0 rounded-full border border-transparent border-t-lime-400/70 border-r-lime-400/10" />
        <div className="dashboard-loader-ring-inner absolute inset-[18%] rounded-full border border-lime-400/15" />
        <div className="dashboard-loader-core absolute inset-[34%] rounded-full bg-gradient-to-br from-lime-400/20 via-lime-400/5 to-transparent shadow-[0_0_24px_rgba(180,244,77,0.12)]" />
      </div>

      <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-white/30">
        Timelly
      </p>
      <h3 className="mt-3 text-lg font-light tracking-[0.12em] text-white/90 sm:text-xl">
        Curating your dashboard
      </h3>
      <p
        key={stepIndex}
        className="dashboard-loader-fade mt-2 text-sm font-light tracking-wide text-white/40"
      >
        Loading {STEPS[stepIndex]}…
      </p>

      <div className="relative mt-10 h-px w-44 max-w-[70%] overflow-hidden bg-white/[0.08] sm:w-52">
        <div className="dashboard-loader-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lime-400/50 to-transparent" />
      </div>

      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((step, index) => (
          <span
            key={step}
            className={`rounded-full transition-all duration-700 ease-out ${
              index === stepIndex
                ? "h-1.5 w-6 bg-lime-400/70 shadow-[0_0_12px_rgba(180,244,77,0.35)]"
                : "h-1.5 w-1.5 bg-white/15"
            }`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
