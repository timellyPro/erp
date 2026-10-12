export function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "sky" | "lime" | "amber" | "ok";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
      : tone === "lime"
        ? "border-lime-500/30 bg-lime-500/10 text-lime-100"
        : tone === "amber"
          ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
          : tone === "ok"
            ? "border-lime-500/25 bg-lime-500/5 text-lime-100/90"
            : "border-white/10 bg-white/5 text-white/80";
  return (
    <div className={`rounded-xl border px-3 py-2 text-center min-w-[4.5rem] ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
