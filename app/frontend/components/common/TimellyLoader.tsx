"use client";

import { useEffect, useState } from "react";

export type TimellyLoaderProps = {
  /** Main heading below the Timelly brand mark */
  title?: string;
  /** Rotating status lines shown under the title */
  steps?: string[];
  /** Smaller loader for sections / sidebars */
  compact?: boolean;
  /** Minimal height wrapper only (no card border) */
  bare?: boolean;
  className?: string;
  ariaLabel?: string;
};

const DEFAULT_STEPS = ["Data", "Insights", "Ready"];

/** Branded Timelly loader — same motion language as the school admin dashboard. */
export default function TimellyLoader({
  title = "Loading your page",
  steps = DEFAULT_STEPS,
  compact = false,
  bare = false,
  className = "",
  ariaLabel = "Loading",
}: TimellyLoaderProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const safeSteps = steps.length > 0 ? steps : DEFAULT_STEPS;

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((i) => (i + 1) % safeSteps.length);
    }, compact ? 1800 : 2200);
    return () => clearInterval(timer);
  }, [safeSteps.length, compact]);

  const shellClass = bare
    ? `relative flex flex-col items-center justify-center px-6 py-10 ${className}`
    : `relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-[#08080a]/50 backdrop-blur-2xl ${
        compact ? "min-h-[14rem] px-6 py-10 sm:min-h-[16rem]" : "min-h-[22rem] px-8 py-14 sm:min-h-[24rem] sm:py-16"
      } ${className}`;

  const ringSize = compact ? "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]" : "h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20";

  return (
    <div className={shellClass} role="status" aria-live="polite" aria-label={ariaLabel}>
      {!bare && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(180,244,77,0.07),transparent_65%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_80%,rgba(255,255,255,0.03),transparent_60%)]" />
        </>
      )}

      <div className={`relative mb-8 flex items-center justify-center sm:mb-10 ${ringSize}`}>
        <div className="dashboard-loader-ring-outer absolute inset-0 rounded-full border border-white/[0.08]" />
        <div className="dashboard-loader-ring-spin absolute inset-0 rounded-full border border-transparent border-t-lime-400/70 border-r-lime-400/10" />
        <div className="dashboard-loader-ring-inner absolute inset-[18%] rounded-full border border-lime-400/15" />
        <div className="dashboard-loader-core absolute inset-[34%] rounded-full bg-gradient-to-br from-lime-400/20 via-lime-400/5 to-transparent shadow-[0_0_24px_rgba(180,244,77,0.12)]" />
      </div>

      <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-white/30">Timelly</p>
      <h3
        className={`mt-3 font-light tracking-[0.12em] text-white/90 ${
          compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
        }`}
      >
        {title}
      </h3>
      <p
        key={stepIndex}
        className="dashboard-loader-fade mt-2 text-sm font-light tracking-wide text-white/40"
      >
        {safeSteps[stepIndex]}…
      </p>

      <div className={`relative overflow-hidden bg-white/[0.08] ${compact ? "mt-8 h-px w-36" : "mt-10 h-px w-44 max-w-[70%] sm:w-52"}`}>
        <div className="dashboard-loader-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lime-400/50 to-transparent" />
      </div>

      <div className={`flex items-center gap-2 ${compact ? "mt-6" : "mt-8"}`}>
        {safeSteps.map((step, index) => (
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
