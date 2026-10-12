"use client";

type Props = {
  activeCount: number | null;
  inactiveCount: number | null;
};

export default function StudentsHeader({ activeCount, inactiveCount }: Props) {
  const activeLabel =
    activeCount != null ? activeCount.toLocaleString() : "—";
  const inactiveLabel =
    inactiveCount != null ? inactiveCount.toLocaleString() : "—";

  return (
    <section className="somu rounded-2xl p-6 md:p-7">
      <h1 className="text-2xl font-semibold text-white">Students</h1>
      <p className="mt-1 text-sm text-white/70">
        Manage records, active/inactive status, and exports
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-xs font-semibold text-lime-300">
          {activeLabel} Active
        </span>
        <span className="rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-300">
          {inactiveLabel} Inactive
        </span>
      </div>
    </section>
  );
}
