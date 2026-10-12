"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";
import { PRIMARY_COLOR, HOVER_COLOR } from "../../constants/colors";

interface SelectOption {
  label: string;
  value?: string;
  disabled?: boolean;
}

interface SelectInputProps {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  bgColor?: "white" | "black";
}

export default function SelectInput({
  value,
  onChange,
  options,
  disabled = false,
  className,
  label,
  error,
  bgColor = "black",
}: SelectInputProps) {
  return (
    <div className={clsx("w-full", className)}>
      {label && (
        <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">
          {label}
        </label>
      )}

      <div className="relative w-full">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          aria-invalid={!!error}
          className={clsx(
            "w-full rounded-xl appearance-none cursor-pointer",
            "pl-4 pr-10 py-2.5 sm:py-3",
            "border",
            bgColor === "black"
              ? "bg-[#0F172A]/50 border-white/10 text-gray-200"
              : "bg-white/10 border-gray-300/20 text-white",
            "text-sm sm:text-base",
            "focus:outline-none focus:ring-0",
            "hover:border-[var(--hover-color)]",
            "focus:border-[var(--primary-color)]",
            disabled && "opacity-60 cursor-not-allowed",
            error && "border-red-500"
          )}
          style={{
            "--primary-color": PRIMARY_COLOR,
            "--hover-color": HOVER_COLOR,
          } as CSSProperties}
        >
          {options.map((option) => (
            <option
              key={`${option.label}-${option.value ?? option.label}`}
              value={option.value ?? option.label}
              disabled={option.disabled}
              className="bg-gray-800 text-white hover:bg-gray-600 focus:bg-gray-600"
            >
              {option.label}
            </option>
          ))}
        </select>

        {/* Dropdown Arrow */}
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70">
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      {error && (
        <p className="text-sm mt-1 text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
