"use client";

interface EventSelectFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function EventSelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select option",
  disabled = false,
  className,
}: EventSelectFieldProps) {
  return (
    <div className={`space-y-2 ${className ?? ""}`.trim()}>
      <label className="text-sm text-white/70">{label}</label>

      <div className="relative">
        <select
          disabled={disabled}
          value={value}
          onChange={onChange}
          className={`
            w-full
            bg-black/30
            border
            border-white/20
            disabled:bg-white/10
            disabled:cursor-not-allowed
            rounded-xl
            px-4 py-3
            pr-10
            text-sm
            text-white
            focus:outline-none
            focus:ring-0
            focus:border-lime-400/60
            appearance-none
            ${value === "" ? "text-white/40" : "text-white"}
          `}
        >
          <option value="">{placeholder}</option>

          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/60">
          ▾
        </span>
      </div>
    </div>
  );
}
