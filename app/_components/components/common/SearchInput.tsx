"use client";

import { useEffect, useRef, useState, ComponentType, type CSSProperties } from "react";
import { LucideProps, Eye, EyeOff } from "lucide-react";
import clsx from "clsx";
import { PRIMARY_COLOR, HOVER_COLOR } from "../../constants/colors";

interface SearchInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onIconClick?: () => void;
  placeholder?: string;

  icon?: ComponentType<LucideProps>;
  showSearchIcon?: boolean;
  iconPosition?: "left" | "right";
  iconClickable?: boolean;
  iconAriaLabel?: string;

  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  type?: string;
  label?: string;
  iconClassName?: string;
  error?: string;

  variant?: "default" | "glass"; // 👈 NEW (non-breaking)
}

export default function SearchInput({
  value,
  onChange,
  onKeyDown,
  onIconClick,
  placeholder = "Search...",
  icon,
  showSearchIcon = true,
  iconPosition = "left",
  iconClickable = false,
  iconAriaLabel = "Input icon",
  disabled = false,
  className,
  inputClassName,
  label,
  type = "text",
  iconClassName = "text-gray-400",
  error,
  variant = "default", // 👈 default safe
}: SearchInputProps) {
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const Icon = icon ?? null;
  const shouldShowIcon = mounted && Icon && showSearchIcon;
  const iconOnRight = iconPosition === "right";
  const shouldRenderIconButton = shouldShowIcon && iconClickable && !disabled;

  const handleIconClick = () => {
    if (onIconClick) {
      onIconClick();
      return;
    }
    if (!inputRef.current) return;
    if (typeof inputRef.current.showPicker === "function") {
      inputRef.current.showPicker();
    }
    inputRef.current.focus();
  };

  const inputType =
    type === "password" ? (showPassword ? "text" : "password") : type;

  const isGlass = variant === "glass";

  return (
    <div className={clsx("w-full", className)}>
      {label && (
        <label className="block text-xs sm:text-sm mb-1 text-white/70">
          {label}
        </label>
      )}

      <div className="relative w-full">

        {shouldShowIcon && !shouldRenderIconButton && (
          <Icon
            size={18}
            className={clsx(
              "absolute top-1/2 -translate-y-1/2",
              iconOnRight ? "right-4" : "left-4",
              "z-10 pointer-events-none",
              isGlass ? "text-white/60" : iconClassName
            )}
          />
        )}
        {shouldRenderIconButton && (
          <button
            type="button"
            onClick={handleIconClick}
            aria-label={iconAriaLabel}
            className={clsx(
              "absolute top-1/2 -translate-y-1/2",
              iconOnRight ? "right-3" : "left-3",
              "z-10 rounded-full p-1.5",
              "text-white/70 hover:text-white",
              "hover:bg-white/10"
            )}
          >
            <Icon size={18} />
          </button>
        )}

        <input
          type={inputType}
          ref={inputRef}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={!!error}
          className={clsx(
            "w-full rounded-xl",
            shouldShowIcon && !iconOnRight ? "pl-11" : "pl-4",
            shouldShowIcon && iconOnRight ? "pr-11" : "pr-4",
            "py-2.5 sm:py-3",
            "bg-black/20 border border-white/10",
            "text-gray-200 text-sm sm:text-base",
            "placeholder-white/40",
            "focus:outline-none focus:ring-0",
            disabled && "opacity-60 cursor-not-allowed",
            inputClassName,

            // 👇 CONDITIONAL STYLING
            isGlass
              ? [
                  "bg-black/30",
                  "border border-white/20",
                  "focus:border-lime-400/60",
                ]
              : [
                  "bg-black/20",
                  "border border-white/10",
                  "hover:border-[var(--hover-color)]",
                  "focus:border-[var(--primary-color)]",
                ]
          )}
          style={
            !isGlass
              ? ({
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  "--primary-color": PRIMARY_COLOR,
                  "--hover-color": HOVER_COLOR,
                } as CSSProperties)
              : undefined
          }
        />

        {type === "password" && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 inset-y-0 flex items-center text-white/70 hover:text-white"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm mt-1 text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
