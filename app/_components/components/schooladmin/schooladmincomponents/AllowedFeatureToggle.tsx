"use client";

interface FeatureToggleProps {
  label: string;
  description?: string;
  checked?: boolean;
  onChange: () => void;
  className?: string;
  labelClassName?: string;
}

export default function AllowedFeatureToggle({
  label,
  description,
  checked = false,
  onChange,
  className,
  labelClassName,
}: FeatureToggleProps) {
  return (
    <label
      className={[
        "flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-lime-400/40 cursor-pointer transition",
        className || "",
      ].join(" ")}
    >
      <span>
        <span className={["text-sm text-white/90 font-medium", labelClassName || ""].join(" ")}>{label}</span>
        {description ? <span className="block text-xs text-white/55 mt-1">{description}</span> : null}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={[
          "relative inline-flex h-6 w-12 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
          checked ? "bg-lime-400" : "bg-white/25",
        ].join(" ")}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
