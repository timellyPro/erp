import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CardTitle, Field } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS } from "../portalSettingsTypes";

const DEFAULT_MONTHS = 12;

export function SchoolResidencyMonthsCard() {
  const [months, setMonths] = useState(String(DEFAULT_MONTHS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/settings", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok && data.settings) {
          setMonths(String(data.settings.residencyYearMonths ?? DEFAULT_MONTHS));
        }
      } catch {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load this setting" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parsed = Number(months);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 12;

  const handleSave = async () => {
    if (!valid) {
      setMessage({ type: "error", text: "Enter a whole number from 1 to 12" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residencyYearMonths: parsed }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Saved. It applies to conversions made from now on." });
      } else {
        setMessage({ type: "error", text: data?.message ?? "Failed to save" });
      }
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
          icon={<CalendarDays className="text-lime-300" size={22} />}
          title="Hostel and day-scholar billing"
          subtitle="Months your school bills in a year when a student moves between hostel and day scholar"
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
            <Field label="Billing months per year">
              <input
                type="number"
                min={1}
                max={12}
                step={1}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className="mt-2 w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-lime-400/50"
              />
              <p className="mt-2 text-xs text-white/50">
                12 counts June to May. Enter 10 if your school bills June to March: each month is then the annual fee
                divided by 10, so a student who moves on 1 October is billed 4 months in one and 6 in the other. This
                applies to conversions made from now on; fees already set are not changed.
              </p>
            </Field>
            {message && (
              <p className={`mt-3 text-sm ${message.type === "success" ? "text-lime-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !valid}
              className="mt-4 px-5 py-2.5 rounded-xl bg-lime-400/20 text-lime-400 border border-lime-400/30 font-medium hover:bg-lime-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save billing months"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
