import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import { CardTitle, Field } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS } from "../portalSettingsTypes";

export function SchoolEmailDomainCard() {
  const [emailDomain, setEmailDomain] = useState("");
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
          setEmailDomain(data.settings.emailDomain ?? "");
        }
      } catch {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load email settings" });
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
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDomain: emailDomain.trim() || null,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Email domain saved." });
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
          icon={<Mail className="text-lime-300" size={22} />}
          title="Email Settings"
          subtitle="Email domain used for auto-generated user emails"
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
            <Field label="Email Domain / Prefix">
              <SearchInput
                value={emailDomain}
                onChange={setEmailDomain}
                icon={Mail}
                variant="glass"
                className="mt-2"
                placeholder='e.g. "myschool" or "myschool.in" (no @)'
              />
              <p className="mt-2 text-xs text-white/50">
                Enter only prefix or full domain. Leave empty to auto-generate from School name. New users will get emails like{" "}
                <span className="text-white/70">firstname.lastname@yourdomain</span>.
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
              disabled={saving}
              className="mt-4 px-5 py-2.5 rounded-xl bg-lime-400/20 text-lime-400 border border-lime-400/30 font-medium hover:bg-lime-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save email settings"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
