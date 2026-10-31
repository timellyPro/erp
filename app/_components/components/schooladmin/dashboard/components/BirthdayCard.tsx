"use client";

import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import type { BirthdaysToday } from "@/lib/school/birthdaysToday";

/** Students whose birthday is today, for the school admin dashboard. */
export function BirthdayCard() {
  const [data, setData] = useState<BirthdaysToday | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/school/birthdays-today", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { message?: string })?.message || "Failed to load birthdays");
        setData(json as BirthdaysToday);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Failed to load birthdays");
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-4 sm:p-6 md:p-8">
      <div className="flex justify-between items-start gap-4 mb-4 sm:mb-6">
        <div>
          <h3 className="font-bold text-xl text-white">Today&apos;s Birthdays</h3>
          <p className="text-gray-400 text-sm mt-0.5">Active students celebrating today</p>
        </div>
        {data && data.count > 0 && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lime-400/20 text-lime-400 flex-shrink-0">
            {data.count}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-300/80">{error}</p>
      ) : !data ? (
        <div className="space-y-3 animate-pulse" aria-label="Loading birthdays">
          <div className="h-10 rounded-xl bg-white/5" />
          <div className="h-10 rounded-xl bg-white/5" />
        </div>
      ) : data.students.length === 0 ? (
        <p className="text-sm text-gray-500">No student birthdays today.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-0">
          {data.students.map((s) => (
            <div
              key={s.id}
              className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 gap-3"
            >
              <div className="flex gap-4 items-center min-w-0">
                <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                  <Cake className="w-5 h-5 text-pink-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-100 truncate">{s.name}</p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">
                    {s.className} • {s.admissionNumber}
                  </p>
                </div>
              </div>
              {s.turning > 0 && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/10 text-white/70 flex-shrink-0">
                  Turns {s.turning}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
