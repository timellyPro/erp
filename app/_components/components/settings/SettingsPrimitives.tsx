"use client";

import type { ReactNode } from "react";
import { LABEL_CLASS } from "./portalSettingsTypes";

type CardTitleProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  wrapperClassName?: string;
  iconContainerClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
};

type FieldProps = {
  label: string;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
};

export function CardTitle({
  icon,
  title,
  subtitle,
  wrapperClassName,
  iconContainerClassName,
  titleClassName,
  subtitleClassName,
}: CardTitleProps) {
  return (
    <div className={["flex items-center gap-3", wrapperClassName || ""].join(" ")}>
      <div
        className={[
          iconContainerClassName || "",
        ].join(" ")}
      >
        {icon}
      </div>
      <div>
        <h2 className={["font-bold text-white text-lg flex items-center gap-2", titleClassName || ""].join(" ")}>{title}</h2>
        <p className={["text-sm text-gray-400 mt-1", subtitleClassName || ""].join(" ")}>{subtitle}</p>
      </div>
    </div>
  );
}

export function Field({ label, className = "", labelClassName = "", children }: FieldProps) {
  return (
    <div className={className}>
      <p className={[LABEL_CLASS, labelClassName].join(" ")}>{label}</p>
      {children}
    </div>
  );
}
