"use client";

import { Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePwaInstall } from "@/app/frontend/hooks/usePwaInstall";

const DISMISS_KEY = "timelly-pwa-install-dismissed";

export default function InstallAppBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);
  const { status, install, canInstall } = usePwaInstall();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }, []);

  const handleInstall = useCallback(async () => {
    const accepted = await install();
    if (accepted) {
      sessionStorage.setItem(DISMISS_KEY, "1");
      setDismissed(true);
    }
  }, [install]);

  if (pathname === "/download" || pathname === "/qr" || !canInstall || dismissed) return null;

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-[60] mx-auto max-w-lg rounded-2xl border border-lime-400/30 bg-zinc-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-md lg:bottom-6 lg:left-auto lg:right-6"
      role="dialog"
      aria-label="Install Timelly app"
    >
      <div className="flex items-start gap-3">
        <img
          src="/pwa-192.png"
          alt=""
          className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover"
          width={48}
          height={48}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Install Timelly</p>
          <p className="mt-0.5 text-xs text-white/65 leading-snug">
            Add to your home screen or desktop for quick access with the Timelly logo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={status === "installing"}
              className="inline-flex items-center gap-1.5 rounded-xl bg-lime-500 px-3 py-2 text-xs font-semibold text-black hover:bg-lime-400 transition disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {status === "installing" ? "Installing…" : "Install app"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/5 transition"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-white/45 hover:text-white/80 hover:bg-white/5 transition"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
