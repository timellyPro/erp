"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Cake } from "lucide-react";
import type { BirthdayStudent, BirthdayStudentLimited } from "@/lib/school/birthdaysToday";

type Payload = { date: string; count: number; students: Array<BirthdayStudentLimited & Partial<BirthdayStudent>> };

type Props = {
  /** Superadmin only: which school to show. Without it the API uses the signed-in user's own school. */
  schoolId?: string | null;
  /** Extra control shown in the header (e.g. the superadmin's school picker). */
  action?: ReactNode;
};

/** Students whose birthday is today, in the signed-in user's school. Parents and students only get name and class. */
export function BirthdayCard({ schoolId, action }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    (async () => {
      try {
        const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
        const res = await fetch(`/api/school/birthdays-today${query}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { message?: string })?.message || "Failed to load birthdays");
        setData(json as Payload);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Failed to load birthdays");
      }
    })();
    return () => controller.abort();
  }, [schoolId]);

  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-4 sm:p-6 md:p-8">
      <div className="flex justify-between items-start gap-4 mb-4 sm:mb-6">
        <div>
          <h3 className="font-bold text-xl text-white">Today&apos;s Birthdays</h3>
          <p className="text-gray-400 text-sm mt-0.5">Students celebrating today</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {action}
          {data && data.count > 0 && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-lime-400/20 text-lime-400">
              {data.count}
            </span>
          )}
        </div>
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
                    {s.admissionNumber ? `${s.className} • ${s.admissionNumber}` : s.className}
                  </p>
                </div>
              </div>
              {typeof s.turning === "number" && s.turning > 0 && (
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
