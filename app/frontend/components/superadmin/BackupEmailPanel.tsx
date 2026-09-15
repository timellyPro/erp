"use client";

import { Clock, Mail, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatScheduleTimeForDisplay } from "@/lib/backupScheduleUtils";

type BackupSchedule = {
  enabled: boolean;
  scheduleTime: string;
  recipient: string;
  schoolId: string | null;
  schoolName: string | null;
  lastSentAt: string | null;
};

type SchoolOption = { id: string; name: string };

export default function BackupEmailPanel({ schools }: { schools: SchoolOption[] }) {
  const [schedule, setSchedule] = useState<BackupSchedule>({
    enabled: false,
    scheduleTime: "06:00",
    recipient: "timelly26@gmail.com",
    schoolId: null,
    schoolName: null,
    lastSentAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/backup-schedule", { cache: "no-store" });
      const data = (await res.json()) as { schedule?: BackupSchedule; message?: string };
      if (!res.ok) throw new Error(data.message || "Failed to load backup schedule");
      if (data.schedule) setSchedule(data.schedule);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backup schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const saveSchedule = async (patch: Partial<BackupSchedule>) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/backup-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { schedule?: BackupSchedule; message?: string };
      if (!res.ok) throw new Error(data.message || "Failed to save schedule");
      if (data.schedule) setSchedule(data.schedule);
      setMessage("Settings saved (this does not send an email). Use “Send backup now” to email the Excel.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/superadmin/backup/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: schedule.recipient,
          schoolId: schedule.schoolId,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        schoolsSent?: string[];
      };
      if (!res.ok) throw new Error(data.message || "Failed to send backup email");
      const names = data.schoolsSent?.join(", ") || "school(s)";
      setMessage(`Backup sent to ${schedule.recipient} (${names})`);
      await loadSchedule();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send backup email");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white/50">
        Loading backup email settings…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-lime-400/20 bg-lime-500/5 px-4 py-4 sm:px-5 sm:py-5 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-lime-100 flex items-center gap-2">
            <Mail className="w-4 h-4 shrink-0" aria-hidden />
            Automated fees backup email
          </h2>
          <p className="text-xs text-white/55 mt-1 max-w-2xl">
            Click <span className="text-white/80">Send backup now</span> to email the Excel immediately.
            Daily automation only runs after deploy (Vercel cron), and only when the toggle is on.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-white/80 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={schedule.enabled}
            disabled={saving || sending}
            onChange={(e) => void saveSchedule({ enabled: e.target.checked })}
            className="rounded border-white/20 bg-black/30 text-lime-500 focus:ring-lime-500/40"
          />
          Daily automation on
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/45 font-semibold flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden />
            Daily time (IST)
          </span>
          <input
            type="time"
            value={schedule.scheduleTime}
            disabled={saving || sending}
            onChange={(e) => setSchedule((s) => ({ ...s, scheduleTime: e.target.value }))}
            onBlur={() => void saveSchedule({ scheduleTime: schedule.scheduleTime })}
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500/30"
          />
          <span className="text-[10px] text-white/40">
            {formatScheduleTimeForDisplay(schedule.scheduleTime)}
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
            Recipient email
          </span>
          <input
            type="email"
            value={schedule.recipient}
            disabled={saving || sending}
            onChange={(e) => setSchedule((s) => ({ ...s, recipient: e.target.value }))}
            onBlur={() => void saveSchedule({ recipient: schedule.recipient })}
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500/30"
            placeholder="timelly26@gmail.com"
          />
        </label>

        <label className="block space-y-1.5 md:col-span-2 lg:col-span-1">
          <span className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
            School
          </span>
          <select
            value={schedule.schoolId ?? ""}
            disabled={saving || sending}
            onChange={(e) => {
              const schoolId = e.target.value || null;
              setSchedule((s) => ({ ...s, schoolId }));
              void saveSchedule({ schoolId });
            }}
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500/30"
          >
            <option value="">All active schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleSendNow()}
            disabled={sending || saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-400/50 bg-lime-500/20 px-4 py-2.5 text-sm font-semibold text-lime-50 hover:bg-lime-500/30 transition disabled:opacity-50"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-lime-100/30 border-t-lime-100 rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4 shrink-0" aria-hidden />
            )}
            {sending ? "Sending… (can take 1–2 min)" : "Send backup now"}
          </button>
          {schedule.lastSentAt && (
            <p className="text-[10px] text-white/40 text-center">
              Last sent: {new Date(schedule.lastSentAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </p>
          )}
          {!schedule.enabled && (
            <p className="text-[10px] text-amber-200/70 text-center">
              Daily auto-send is off
            </p>
          )}
        </div>
      </div>

      {message && (
        <p className="text-sm text-lime-200/90" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
