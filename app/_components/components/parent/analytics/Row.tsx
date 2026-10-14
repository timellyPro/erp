interface RowProps {
  title: string;
  sub?: string;
  right: string;
}

export default function Row({ title, sub, right }: RowProps) {
  return (
    <div className="flex justify-between bg-white/10 rounded-xl p-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {sub && <div className="text-xs text-white/40">{sub}</div>}
      </div>
      <span className="text-xs text-white/50">{right}</span>
    </div>
  );
}
