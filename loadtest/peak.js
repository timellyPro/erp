// k6 load test for the two real peaks: morning attendance reads and fee-deadline reads.
// READ-ONLY (never marks attendance or creates payments), so it is safe to run
// against staging. Do NOT run against production during school hours.
//
//   k6 run -e BASE_URL=https://staging.example.com -e TEACHER_COOKIE='next-auth.session-token=...' -e PARENT_COOKIE='next-auth.session-token=...' loadtest/peak.js
//
// TEACHER_COOKIE / PARENT_COOKIE are session cookies copied from logged-in teacher / parent browser sessions.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const teacherParams = { headers: { Cookie: __ENV.TEACHER_COOKIE || __ENV.COOKIE || "" } };
const parentParams = { headers: { Cookie: __ENV.PARENT_COOKIE || __ENV.COOKIE || "" } };

// Adjustable load. Defaults match the full staging test; for a gentle production run use e.g.
//   -e TEACHER_VUS=10 -e PARENT_VUS=15 -e HOLD=2m
const TEACHER_VUS = Number(__ENV.TEACHER_VUS || 30);
const PARENT_VUS = Number(__ENV.PARENT_VUS || 50);
const HOLD = __ENV.HOLD || "3m";

const scenarios = {
  morning_attendance: {
    executor: "ramping-vus",
    exec: "attendance",
    startVUs: 0,
    stages: [
      { duration: "1m", target: TEACHER_VUS },
      { duration: HOLD, target: TEACHER_VUS },
      { duration: "30s", target: 0 },
    ],
  },
};

// The fee page only accepts a student/parent login; skip it when none is supplied.
if (__ENV.PARENT_COOKIE) {
  scenarios.fee_deadline = {
    executor: "ramping-vus",
    exec: "fees",
    startVUs: 0,
    stages: [
      { duration: "1m", target: PARENT_VUS },
      { duration: HOLD, target: PARENT_VUS },
      { duration: "30s", target: 0 },
    ],
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export function attendance() {
  const r = http.get(`${BASE}/api/teacher/dashboard`, teacherParams);
  check(r, { "dashboard < 500": (x) => x.status < 500 });
  sleep(1 + Math.random() * 2);
}

export function fees() {
  const r = http.get(`${BASE}/api/fees/mine`, parentParams);
  check(r, { "fees < 500": (x) => x.status < 500 });
  sleep(1 + Math.random() * 2);
}

export function health() {
  http.get(`${BASE}/api/health`);
}
