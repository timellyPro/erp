import { normalizeStatus, STATUS_META, type AttendanceRecord, type DayStatus } from "../attendanceUtils";

export function SelectedDaySection({
  selectedDayLabel,
  selectedDayStatus,
  selectedDayRecords,
}: {
  selectedDayLabel: string;
  selectedDayStatus: DayStatus;
  selectedDayRecords: AttendanceRecord[];
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-3.5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg sm:text-xl font-semibold text-white">{selectedDayLabel}</h3>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_META[selectedDayStatus].cardBg} ${STATUS_META[selectedDayStatus].textClass}`}
        >
          {STATUS_META[selectedDayStatus].label}
        </span>
      </div>

      <div className="mt-4">
        {selectedDayRecords.length ? (
          <div className="flex flex-wrap gap-2">
            {selectedDayRecords.map((record) => {
              const status = normalizeStatus(record.status) ?? "PRESENT";
              return (
                <span
                  key={record.id}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${STATUS_META[status].cardBg} ${STATUS_META[status].textClass}`}
                >
                  Period {record.period}: {status}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/60">No period-wise attendance records are available for this date.</p>
        )}
      </div>
    </section>
  );
}
