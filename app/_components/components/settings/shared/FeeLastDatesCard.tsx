import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { CardTitle, Field } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS } from "../portalSettingsTypes";

const HEADS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "tuition", label: "Tuition" },
  { key: "hostel", label: "Hostel" },
  { key: "mess", label: "Mess" },
  { key: "bus", label: "Bus" },
  { key: "admission", label: "Admission" },
  { key: "other", label: "Other" },
  { key: "previousYear", label: "Previous Year" },
];

/** School admin sets the last date to pay each fee head; parents see it in the fee-due popup. */
export function FeeLastDatesCard() {
  const [dates, setDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/settings", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok && data.settings?.feeLastDates) {
          setDates(data.settings.feeLastDates as Record<string, string>);
        }
      } catch {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load last dates" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, string> = {};
      for (const h of HEADS) body[h.key] = dates[h.key] ?? "";
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeLastDates: body }),
        credentials: "include",
      });
      const data = await res.json();
      setMessage(
        res.ok
          ? { type: "success", text: "Saved. Parents now see these last dates." }
          : { type: "error", text: data?.message ?? "Failed to save" }
      );
    } catch {
      setMessage({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle
          icon={<CalendarClock className="text-lime-300" size={22} />}
          title="Fee last dates"
          subtitle="Last date parents should pay each fee. Shown in the parent app fee-due notice."
        />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/20 border-t-lime-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {HEADS.map((h) => (
                <Field key={h.key} label={h.label}>
                  <input
                    type="date"
                    value={dates[h.key] ?? ""}
                    onChange={(e) => setDates((prev) => ({ ...prev, [h.key]: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-lime-400/50"
                  />
                </Field>
              ))}
            </div>
            <p className="mt-3 text-xs text-white/50">Leave a date empty to show no last date for that fee.</p>
            {message && (
              <p className={`mt-3 text-sm ${message.type === "success" ? "text-lime-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 px-5 py-2.5 rounded-xl bg-lime-400/20 text-lime-400 border border-lime-400/30 font-medium hover:bg-lime-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save last dates"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
