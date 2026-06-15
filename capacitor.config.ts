import type { CapacitorConfig } from "@capacitor/cli";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Load .env so `npm run cap:sync` picks up CAPACITOR_SERVER_URL without manual export.
loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

/**
 * Timelly ERP runs as a hosted Next.js app (API routes + NextAuth).
 * Capacitor loads the server URL in a native WebView.
 *
 * Set CAPACITOR_SERVER_URL in .env (falls back to NEXTAUTH_URL if unset).
 * Must match NEXTAUTH_URL in production so auth cookies work.
 *
 * Local dev:
 *   iOS simulator:    http://localhost:3000
 *   Android emulator: http://10.0.2.2:3000  (also set NEXTAUTH_URL to this)
 *   Physical device:  http://<your-lan-ip>:3000
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXTAUTH_URL?.trim() ||
  "";

if (!serverUrl) {
  console.warn(
    "[Capacitor] CAPACITOR_SERVER_URL and NEXTAUTH_URL are unset. " +
      "Native projects will load www/index.html only. Add CAPACITOR_SERVER_URL to .env.",
  );
}

const config: CapacitorConfig = {
  appId: "com.timelly.erp",
  appName: "Timelly",
  webDir: "www",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
          androidScheme: serverUrl.startsWith("https://") ? "https" : "http",
        },
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#28143F",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#28143F",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
};

export default config;
