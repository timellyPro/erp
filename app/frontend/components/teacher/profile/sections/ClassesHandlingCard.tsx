"use client";

import { ClassHandlingItem } from "../types";

interface ClassesHandlingCardProps {
  classes: ClassHandlingItem[];
}

export default function ClassesHandlingCard({ classes }: ClassesHandlingCardProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
      <div className="p-4 sm:p-5">
        <h3 className="text-xl font-bold text-white">Classes Handling</h3>
        <p className="mt-2 text-[12px] text-white/60">Current academic year</p>
      </div>
      <div className="h-px bg-white/10" />

      <div>
        {classes.length === 0 ? (
          <p className="px-5 sm:px-6 py-8 text-sm text-white/45">No classes assigned yet.</p>
        ) : (
          classes.map((item) => (
            <div key={item.className} className="border-b border-white/10 px-5 sm:px-6 py-5 last:border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[15px] sm:text-[16px] font-semibold text-white">{item.className}</p>
                  {item.subject ? (
                    <span className="rounded-xl border border-lime-400/40 bg-lime-400/10 px-3 py-1 text-[11px] sm:text-[12px] font-semibold text-lime-400">
                      {item.subject}
                    </span>
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[18px] font-bold text-lime-400">{item.students}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/35">Students</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
