import * as Sentry from "@sentry/nextjs";

// No DSN => SDK stays disabled, so local dev and CI are unaffected.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.05,
  // Student/parent data: never attach IPs, cookies or request bodies.
  sendDefaultPii: false,
});
