"use client";

import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export function getPlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

/** Open external URLs (payment gateways, etc.) in the system browser on native. */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  if (isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
    return;
  }

  window.location.href = url;
}
