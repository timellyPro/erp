"use client";

import React from "react";
import { Search } from "lucide-react";

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  required?: boolean;
  bgColor?: "black" | "white";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  error?: string;
}

export default function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  icon,
  required = false,
  bgColor = "black",
  inputMode,
  autoComplete,
  error,
}: InputFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/70 mb-1.5">
        {label} {required ? "*" : ""}
      </label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40">
            {icon}
          </span>
        ) : null}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          className={`w-full ${icon ? "pl-11" : "pl-4"} pr-4 py-3 ${bgColor==="black"?`bg-black/20`:`bg-white/5`} border rounded-xl 
          focus:outline-none focus:ring-1 text-gray-400 ${
            error
              ? "border-red-500/60 focus:ring-red-400/40"
              : "border-white/10 focus:ring-lime-400/50"
          }`}
          placeholder={placeholder}
        />
      </div>
      {error ? (
        <p className="text-xs text-red-400 mt-1.5" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40">
        <Search className="w-4 h-4" />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white/10 border border-white/15
                    text-white placeholder:text-white/40 outline-none text-sm
                    focus:bg-white/15 focus:border-lime-400/50 transition"
      />
    </div>
  );
}
