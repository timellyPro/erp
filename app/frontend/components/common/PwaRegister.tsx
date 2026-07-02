"use client";

import { useEffect } from "react";

/** Registers the service worker so browsers can offer "Install app". */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        console.warn("PWA service worker registration failed:", err);
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", () => void register(), { once: true });
    }
  }, []);

  return null;
}
