"use client";

import { useCallback, useEffect, useState } from "react";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaInstallStatus =
  | "checking"
  | "installed"
  | "available"
  | "installing"
  | "unavailable";

function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

type UsePwaInstallOptions = {
  /** Call `prompt()` as soon as the browser fires `beforeinstallprompt`. */
  autoPrompt?: boolean;
};

export function usePwaInstall(options: UsePwaInstallOptions = {}) {
  const { autoPrompt = false } = options;
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<PwaInstallStatus>("checking");
  const [autoPromptFailed, setAutoPromptFailed] = useState(false);

  const runInstall = useCallback(async (promptEvent: BeforeInstallPromptEvent) => {
    setStatus("installing");
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setStatus("installed");
        return true;
      }
      setStatus("available");
      return false;
    } catch {
      setAutoPromptFailed(true);
      setStatus("available");
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandaloneApp()) {
      setStatus("installed");
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setStatus("available");
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setStatus("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const timer = window.setTimeout(() => {
      setStatus((current) => (current === "checking" ? "unavailable" : current));
    }, 2500);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!autoPrompt || !deferredPrompt || autoPromptFailed || status !== "available") return;
    void runInstall(deferredPrompt);
  }, [autoPrompt, autoPromptFailed, deferredPrompt, runInstall, status]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    return runInstall(deferredPrompt);
  }, [deferredPrompt, runInstall]);

  return {
    status,
    install,
    canInstall: Boolean(deferredPrompt),
    isIos: isIos(),
    autoPromptFailed,
  };
}
