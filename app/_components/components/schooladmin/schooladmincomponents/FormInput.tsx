interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
  error?: boolean;
}

export default function FormInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  helperText,
  error = false,
}: FormInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-2">
        {label} {required && "*"}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-2 rounded-lg bg-white/10 border
          text-white placeholder:text-white/40 outline-none
          focus:bg-white/15 focus:border-lime-400/40 transition
          ${error ? "border-red-400/50" : "border-white/20"}`}
      />
      {helperText && (
        <p className="text-xs text-white/60 mt-1">{helperText}</p>
      )}
    </div>
  );
}
