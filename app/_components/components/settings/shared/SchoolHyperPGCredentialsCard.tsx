import { useEffect, useState } from "react";
import { CreditCard, Lock } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import { CardTitle, Field } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS } from "../portalSettingsTypes";

export function SchoolHyperPGCredentialsCard() {
  const [hyperpgMerchantId, setHyperpgMerchantId] = useState("");
  const [hyperpgApiKey, setHyperpgApiKey] = useState("");
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
          setHyperpgMerchantId(data.settings.hyperpgMerchantId ?? "");
          setHyperpgApiKey(data.settings.hyperpgApiKey ?? "");
        }
      } catch {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load payment settings" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hyperpgMerchantId: hyperpgMerchantId.trim() || null,
          hyperpgApiKey: hyperpgApiKey.trim() || null,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Payment credentials saved." });
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
        <CardTitle icon={<CreditCard className="text-lime-300" size={22} />} title="Payment (HyperPG)" subtitle="Each school has unique Merchant ID and API Key from the payments team" />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/20 border-t-lime-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Field label="HyperPG Merchant ID">
              <SearchInput value={hyperpgMerchantId} onChange={setHyperpgMerchantId} icon={CreditCard} variant="glass" className="mt-2" placeholder="e.g. timellytestmid" />
            </Field>
            <Field label="HyperPG API Key" className="mt-4">
              <SearchInput value={hyperpgApiKey} onChange={setHyperpgApiKey} type="password" icon={Lock} variant="glass" className="mt-2" placeholder="API key from payments team" />
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
              {saving ? "Saving…" : "Save payment credentials"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
