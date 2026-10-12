type Props = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string; // ✅ allow custom styling
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  className = "",
}: Props) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-xs uppercase tracking-widest text-white/60">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`
          h-9 w-full
          bg-black/30 backdrop-blur-md
          border border-white/10
          px-4 text-sm text-white
          outline-none
          focus:border-white/30
          transition
          rounded-full
          ${className}
        `}
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[#0f0f0f]">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
