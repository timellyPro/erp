"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/capacitor";

export default function CapacitorInit() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;
    let removeBackListener: (() => void) | undefined;

    async function initNativeShell() {
      const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/app"),
      ]);

      if (cancelled) return;

      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#28143F" });
      } catch {
        // Status bar APIs are unavailable on some WebView builds.
      }

      try {
        await SplashScreen.hide();
      } catch {
        // Splash may already be hidden.
      }

      const backListener = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        App.exitApp();
      });

      if (cancelled) {
        await backListener.remove();
        return;
      }

      removeBackListener = () => {
        void backListener.remove();
      };
    }

    void initNativeShell();

    return () => {
      cancelled = true;
      removeBackListener?.();
    };
  }, []);

  return null;
}
