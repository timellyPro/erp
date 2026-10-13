"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EXTERNAL_STATUS_URL, SUPPORT_EMAIL } from "@/lib/support";

type Health = { status?: string; checks?: Record<string, "ok" | "fail"> };

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = (await res.json()) as Health;
        if (!cancelled) {
          setHealth(data);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) setUnreachable(true);
      } finally {
        if (!cancelled) setCheckedAt(new Date());
      }
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const allOk =
    !!health && health.status === "ok" && Object.values(health.checks ?? {}).every((c) => c === "ok");
  const label = unreachable
    ? "Unreachable"
    : health
      ? allOk
        ? "All systems operational"
        : "Degraded"
      : "Checking…";
  const color =
    unreachable || (health && !allOk) ? "bg-red-500" : health ? "bg-emerald-500" : "bg-zinc-400";

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-8 text-zinc-800 shadow-2xl">
        <h1 className="text-3xl font-bold text-zinc-950">Timelly status</h1>
        <p className="mt-4 flex items-center gap-2 text-lg font-semibold" aria-live="polite">
          <span className={`inline-block h-3 w-3 rounded-full ${color}`} />
          {label}
        </p>
        {health?.checks && (
          <ul className="mt-4 divide-y divide-zinc-200 text-sm">
            {Object.entries(health.checks).map(([name, state]) => (
              <li key={name} className="flex justify-between py-2 capitalize">
                <span>{name}</span>
                <span className={state === "ok" ? "text-emerald-600" : "text-red-600"}>
                  {state === "ok" ? "Operational" : "Failing"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {checkedAt && (
          <p className="mt-4 text-xs text-zinc-500">
            Last checked {checkedAt.toLocaleTimeString()} (refreshes every 30s)
          </p>
        )}
        <p className="mt-6 text-sm">
          {EXTERNAL_STATUS_URL && (
            <>
              <a className="text-violet-700 underline" href={EXTERNAL_STATUS_URL}>
                Incident history and alerts
              </a>
              {" · "}
            </>
          )}
          <Link className="text-violet-700 underline" href="/support">
            Contact support
          </Link>{" "}
          ({SUPPORT_EMAIL})
        </p>
      </article>
    </main>
  );
}
