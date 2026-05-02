import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor CLI does not load Next.js env files; load explicitly for `cap sync` / `cap run`.
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://app.timelly.in";

const config: CapacitorConfig = {
  appId: "com.timely.erp",
  appName: "Timely",
  webDir: "capacitor-www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
