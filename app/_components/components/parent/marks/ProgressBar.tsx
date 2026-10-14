interface ProgressBarProps {
  label: string;
  value: number;
  color: string;
  textColor: string;
}

export default function ProgressBar({
  label,
  value,
  color,
  textColor,
}: ProgressBarProps) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={`text-sm font-bold ${textColor}`}>
          {value}%
        </span>
      </div>

      <div className="w-full h-2 bg-white/[0.1] rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

