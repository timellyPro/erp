export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent ?? "bg-lime-400/10"}`}
      >
        <Icon size={20} className={accent ? "text-white" : "text-lime-400"} />
      </div>
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
        {sub ? <p className="text-[11px] text-white/40">{sub}</p> : null}
      </div>
    </div>
  );
}
