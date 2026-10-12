export type SelectFieldOption = { id: string; name: string };

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  disabled?: boolean;
}

export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select option",
  disabled=false
}: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-black">{label}</label>

      <div className="relative">
        <select
          disabled={disabled}
          value={value}
          onChange={onChange}
          className={`
            w-full
            bg-white
            border
            border-gray-300
            disabled:bg-gray-100
            disabled:cursor-not-allowed
            border-black
            rounded-xl
            px-4 py-3
            pr-10
            text-sm
            focus:outline-none
            focus:ring-0
            appearance-none
            ${value === "" ? "text-gray-500" : "text-black"}
          `}
        >
          <option value="">{placeholder}</option>

          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black">
          ▾
        </span>
      </div>
    </div>
  );
}
