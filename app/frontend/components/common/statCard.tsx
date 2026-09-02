"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface StatCardProps {
  title?: string;
  value?: string | number | ReactNode;
  subtitle?: string; // ✅ NEW
  icon?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
  iconVariant?: "boxed" | "plain";
  showBgIcon?: boolean;
  variant?: "default" | "gradientCentered"; // ✅ NEW
  gradient?: string; // ✅ NEW
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  footer,
  className = "",
  children,
  iconVariant = "boxed",
  showBgIcon = false,
  variant = "default",
}: StatCardProps) {
  const isCentered = variant === "gradientCentered";

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={`
        relative overflow-hidden
        rounded-2xl
        p-4 sm:p-5
        transition-all duration-300
        border
        group
        ${
          isCentered
            ? `bg-gradient-to-br  border-white/10 text-white`
            : `bg-white/5 backdrop-blur-xl border-white/10`
        }
        ${className}
      `}
    >
      {/* ================= OPTIONAL BIG BACKGROUND ICON ================= */}
      {showBgIcon && icon && !isCentered && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 scale-[2.6] text-white/15 pointer-events-none z-0">
          {icon}
        </div>
      )}

      {/* ================= CONTENT ================= */}
      <div
        className={`relative z-10 ${
          isCentered
            ? "flex flex-col items-center justify-center text-center space-y-3"
            : ""
        }`}
      >
        {/* ================= GRADIENT CENTERED VERSION ================= */}
        {isCentered ? (
          <>
            {icon && (
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
                {icon}
              </div>
            )}

            {value && (
              <h2 className="text-3xl md:text-4xl font-bold tracking-wide">
                {value}
              </h2>
            )}

            {title && (
              <p className="text-sm opacity-80">
                {title}
              </p>
            )}

            {subtitle && (
              <p className="text-sm text-lime-300 font-medium">
                {subtitle}
              </p>
            )}
          </>
        ) : (
          <>
            {(title || value || icon) && (
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {icon && (
                      <div className="w-10 h-10 rounded-xl bg-black/20 backdrop-blur flex items-center justify-center">
                        <div className="scale-[0.45] saturate-150 brightness-110">
                          {icon}
                        </div>
                      </div>
                    )}

                    {title && (
                      <p className="text-white/70 text-sm font-medium">
                        {title}
                      </p>
                    )}
                  </div>

                  {value && (
                    <h2 className="text-4xl font-bold text-white">
                      {value}
                    </h2>
                  )}
                </div>
              </div>
            )}

            {children}

            {footer && (
              <div className="mt-4 text-sm text-white/60">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
