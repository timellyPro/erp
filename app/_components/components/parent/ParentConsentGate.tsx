"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Blocks the parent portal until the parent has acknowledged the current privacy
 * policy on behalf of their child. Fails open on network errors so an outage of
 * /api/consent never locks parents out of fee payments.
 */
export default function ParentConsentGate() {
  const [needsConsent, setNeedsConsent] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consent", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && d.accepted === false) setNeedsConsent(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needsConsent) return null;

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/consent", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      setNeedsConsent(false);
    } catch {
      setError("Could not save your consent. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 text-zinc-800 shadow-2xl"
      >
        <h2 id="consent-title" className="text-lg font-semibold text-zinc-950">
          Privacy &amp; parental consent
        </h2>
        <p className="mt-3 text-sm leading-relaxed">
          Your child&apos;s school uses Timelly to manage attendance, marks, fees and
          communication. This includes personal information about your child. Please
          read our{" "}
          <Link
            href="/privacy-policy"
            target="_blank"
            className="font-medium text-violet-700 underline underline-offset-2"
          >
            Privacy Policy
          </Link>{" "}
          and confirm below.
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1"
          />
          <span>
            I am the parent or legal guardian of the student(s) linked to this account,
            and I consent to the processing of their information as described in the
            Privacy Policy.
          </span>
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={!checked || saving}
          onClick={accept}
          className="mt-5 w-full rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "I agree"}
        </button>
      </div>
    </div>
  );
}
