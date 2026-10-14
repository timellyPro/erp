// k6 load test for STAGING with separate logins: every virtual user is a different seeded teacher.
// READ-ONLY apart from the logins. Do NOT point this at production.
//
//   k6 run -e BASE_URL=https://timelly-staging.vercel.app -e SEED_CSV=/abs/path/seed-logins.csv loadtest/staging-peak.js
//
// SEED_CSV is the logins file written by scripts/seedStaging.ts (columns: role,email,password,school).
// Optional: -e VUS=30 -e HOLD=3m
import http from "k6/http";
import { check, fail, sleep } from "k6";

const BASE = __ENV.BASE_URL;
if (!BASE) throw new Error("BASE_URL is required");
if (BASE.includes("app.timelly.in")) throw new Error("Refusing to run against production");
const VUS = Number(__ENV.VUS || 30);
const HOLD = __ENV.HOLD || "3m";

const teachers = open(__ENV.SEED_CSV)
  .split("\n")
  .slice(1)
  .map((l) => l.trim().split(","))
  .filter((p) => p[0] === "TEACHER")
  .map((p) => ({ email: p[1], password: p[2] }));

export const options = {
  setupTimeout: "5m",
  scenarios: {
    teachers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: VUS },
        { duration: HOLD, target: VUS },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:dashboard}": ["p(95)<1500"],
  },
};

function login(t) {
  const jar = new http.CookieJar();
  const csrf = http.get(`${BASE}/api/auth/csrf`, { jar }).json("csrfToken");
  http.post(
    `${BASE}/api/auth/callback/credentials`,
    { csrfToken: csrf, email: t.email, password: t.password, json: "true" },
    { jar, redirects: 0 }
  );
  const cookies = jar.cookiesForURL(BASE);
  const parts = [];
  for (const name of Object.keys(cookies)) {
    if (name.indexOf("session-token") !== -1) parts.push(`${name}=${cookies[name][0]}`);
  }
  return parts.join("; ");
}

export function setup() {
  if (teachers.length === 0) fail("No TEACHER rows found in SEED_CSV");
  const sessions = [];
  for (const t of teachers) {
    const cookie = login(t);
    if (cookie) sessions.push(cookie);
    sleep(0.3);
  }
  console.log(`logged in ${sessions.length} of ${teachers.length} teachers`);
  if (sessions.length === 0) fail("No teacher could log in");
  return { sessions };
}

export default function (data) {
  const cookie = data.sessions[(__VU - 1) % data.sessions.length];
  const r = http.get(`${BASE}/api/teacher/dashboard`, {
    headers: { Cookie: cookie },
    tags: { name: "dashboard" },
  });
  check(r, { "dashboard 200": (x) => x.status === 200 });
  sleep(1 + Math.random() * 2);
}
