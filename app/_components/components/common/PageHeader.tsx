"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
  center?: boolean;
  transparent?: boolean;
  compact?: boolean;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  rightSlot,
  className = "",
  center = false,
  transparent = false,
  compact = false,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        rounded-xl sm:rounded-2xl md:rounded-3xl
        flex flex-col md:flex-row
        md:items-center md:justify-between gap-2 sm:gap-3 md:gap-4
        ${compact ? "p-3 sm:p-4 md:p-6 mb-3 sm:mb-4 md:mb-6" : "p-4 sm:p-5 md:p-6 mb-4 sm:mb-6 md:mb-8"}
        ${transparent ? "bg-transparent" : "bg-white/5 backdrop-blur-xl border-b border-white/10"}
        ${className}
      `}
    >
      {/* LEFT */}
      <div className={`min-w-0 flex-1 ${center ? "flex flex-col items-center text-center" : ""}`}>
        <h1
          className={`font-bold text-white flex items-center gap-2 min-w-0 ${
            compact ? "text-lg sm:text-xl md:text-2xl" : "text-xl sm:text-2xl"
          } ${center ? "justify-center" : ""}`}
        >
          {icon && (
            <span className="text-[#b4f03d] flex items-center">
              {icon}
            </span>
          )}
          {title}
        </h1>

        {subtitle && (
          <p className={`text-white/60 mt-0.5 sm:mt-1 ${compact ? "text-xs sm:text-sm" : "text-sm"}`}>
            {subtitle}
          </p>
        )}
      </div>

      {/* RIGHT */}
      {rightSlot && (
        <div
          className={
            center
              ? "w-full md:w-auto shrink-0 min-w-0 flex justify-center md:justify-end md:ml-auto"
              : "w-full md:w-auto shrink-0 min-w-0"
          }
        >
          {rightSlot}
        </div>
      )}
    </motion.div>
  );
}
