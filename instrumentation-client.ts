import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

// The page CSP blocks eval. zod's JIT probe (`Function("")`) would log a CSP violation on every
// load, so opt out of JIT in the browser. Validation behaviour is unchanged.
z.config({ jitless: true });

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.02,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
