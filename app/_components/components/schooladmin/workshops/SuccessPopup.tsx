"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SuccessPopupProps = {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  portalTargetId?: string;
};

export default function SuccessPopup({
  open,
  title,
  description,
  onClose,
  portalTargetId,
}: SuccessPopupProps) {
  const [mounted, setMounted] = useState(false);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !portalTargetId) return;
    setTargetEl(document.getElementById(portalTargetId));
  }, [mounted, portalTargetId]);

  if (!open || !mounted) return null;
  if (portalTargetId && !targetEl) return null;

  const wrapperClassName = portalTargetId
    ? "absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
    : "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md";

  const popup = (
    <div
      className={wrapperClassName}
      onClick={onClose}
    >
      <div
        className="max-w-[360px] rounded-2xl bg-slate-900/90 border border-white/10 px-5 py-4 text-left shadow-xl backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-lime-400/20 border border-lime-400/50 flex items-center justify-center text-lime-300">
            <Check size={18} />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">{title}</div>
            <div className="text-white/60 text-xs mt-0.5">{description}</div>
          </div>
        </div>
      </div>
    </div>
  );
  if (portalTargetId && targetEl) {
    return createPortal(popup, targetEl);
  }
  return createPortal(popup, document.body);
}
