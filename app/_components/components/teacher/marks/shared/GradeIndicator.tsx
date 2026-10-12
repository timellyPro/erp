export function GradeIndicator({ grade }: { grade: string }) {
  const colorMap: Record<string, string> = {
    "A+": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    A: "bg-green-500/20 text-green-400 border-green-500/30",
    "B+": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    B: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    F: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const cls = colorMap[grade] ?? "bg-white/10 text-white/60 border-white/20";
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cls}`}>
      {grade}
    </span>
  );
}
