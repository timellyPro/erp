export function StudentNameCard({
  name,
  meta,
  className = "",
}: {
  name: string;
  meta?: string | null;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 min-w-0 ${className}`}>
      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Name</p>
      <p className="text-xs sm:text-sm font-bold text-white truncate">{name}</p>
      {meta ? <p className="text-[10px] text-gray-400 truncate mt-0.5">{meta}</p> : null}
    </div>
  );
}
