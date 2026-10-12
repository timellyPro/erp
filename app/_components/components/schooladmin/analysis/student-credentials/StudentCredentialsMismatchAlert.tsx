"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  mismatchCount: number;
};

export default function StudentCredentialsMismatchAlert({ mismatchCount }: Props) {
  if (mismatchCount <= 0) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100 sm:text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <strong>{mismatchCount}</strong> student{mismatchCount === 1 ? "" : "s"}{" "}
        have a password that does not match their DOB. Use{" "}
        <strong>Reset to DOB password</strong>, then share the updated list.
      </p>
    </div>
  );
}
