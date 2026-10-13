// k6 load test for the two real peaks: morning attendance reads and fee-deadline reads.
// READ-ONLY (never marks attendance or creates payments), so it is safe to run
// against staging. Do NOT run against production during school hours.
//
//   k6 run -e BASE_URL=https://staging.example.com -e COOKIE='next-auth.session-token=...' loadtest/peak.js
//
// COOKIE is a session cookie copied from a logged-in teacher/parent browser session.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const params = { headers: { Cookie: __ENV.COOKIE || "" } };

export const options = {
  scenarios: {
    morning_attendance: {
      executor: "ramping-vus",
      exec: "attendance",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 30 },
        { duration: "3m", target: 30 },
        { duration: "30s", target: 0 },
      ],
    },
    fee_deadline: {
      executor: "ramping-vus",
      exec: "fees",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export function attendance() {
  const r = http.get(`${BASE}/api/teacher/dashboard`, params);
  check(r, { "dashboard < 500": (x) => x.status < 500 });
  sleep(1 + Math.random() * 2);
}

export function fees() {
  const r = http.get(`${BASE}/api/fees/mine`, params);
  check(r, { "fees < 500": (x) => x.status < 500 });
  sleep(1 + Math.random() * 2);
}

export function health() {
  http.get(`${BASE}/api/health`);
}
