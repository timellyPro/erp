"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatRupee } from "@/lib/formatRupee";
import { residencyPeriodTitle, type ResidencyKind } from "@/lib/residencyConversion";

export type ConversionPeriod = {
  title: string;
  months: number;
  residencyType: string;
  transportLabel?: string | null;
};

export type ConversionCharge = {
  label: string;
  months: number;
  annualAmount: number;
  proratedAmount: number;
  alreadyPaid: number;
};

export type ConversionTransportOption = {
  key: string;
  label: string;
  annualAmount: number;
  proratedAmount: number;
};

export type ConversionPreview = {
  academicYearLabel: string;
  fromResidency: ResidencyKind;
  toResidency: ResidencyKind;
  periods: ConversionPeriod[];
  charges: ConversionCharge[];
  transportOptions: ConversionTransportOption[];
  requiresTransportChoice: boolean;
};

type Props = {
  preview: ConversionPreview;
  transportKey: string;
  saving: boolean;
  onTransportKey: (key: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

function money(n: number) {
  return `₹${formatRupee(n)}`;
}

export default function ResidencyConversionModal({
  preview,
  transportKey,
  saving,
  onTransportKey,
  onClose,
  onConfirm,
}: Props) {
  const needsChoice = preview.requiresTransportChoice;
  const blocked = saving || (needsChoice && !transportKey);
  const toTitle = residencyPeriodTitle(preview.toResidency);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="residency-conversion-title"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h4 id="residency-conversion-title" className="text-lg font-semibold text-white">
              Convert this student to {toTitle}
            </h4>
            <p className="mt-1 text-xs text-white/55">
              Only this student. {preview.academicYearLabel} fees are split by the months in each type.
              Receipts already saved are not changed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">Time in each type</p>
          <ul className="mt-2 space-y-1.5">
            {preview.periods.map((period, index) => (
              <li key={`${period.residencyType}-${period.months}-${index}`} className="text-sm text-white">
                <span className="font-semibold text-lime-300">{period.months} months</span>{" "}
                {period.title}
                {period.transportLabel ? ` · ${period.transportLabel}` : ""}
              </li>
            ))}
          </ul>
        </div>

        {preview.transportOptions.length > 0 && preview.toResidency === "Day Scholar" ? (
          <div className="mb-4">
            <p className="mb-2 text-center text-sm font-semibold text-white">
              Which kilometres does this student travel?
            </p>
            <div className="space-y-2">
              {preview.transportOptions.map((option) => {
                const selected = transportKey === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onTransportKey(option.key)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                      selected
                        ? "border-lime-400/70 bg-lime-500/15"
                        : "border-white/10 bg-black/30 hover:bg-white/5"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">{option.label}</span>
                    <span className="block text-xs text-white/55">
                      Full year {money(option.annualAmount)} · this stay {money(option.proratedAmount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {preview.charges.length > 0 ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-xs text-white/80">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wide text-white/40">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fee</th>
                  <th className="px-3 py-2 font-semibold">Months</th>
                  <th className="px-3 py-2 text-right font-semibold">To collect</th>
                  <th className="px-3 py-2 text-right font-semibold">Already paid</th>
                </tr>
              </thead>
              <tbody>
                {preview.charges.map((charge) => (
                  <tr key={charge.label} className="border-t border-white/10">
                    <td className="px-3 py-2">{charge.label}</td>
                    <td className="px-3 py-2">{charge.months}</td>
                    <td className="px-3 py-2 text-right">{money(charge.proratedAmount)}</td>
                    <td className="px-3 py-2 text-right">{money(charge.alreadyPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-4 text-sm text-amber-200/90">
            No hostel, mess, or transport fee is set up for this class yet. The residency will still change for this student only.
          </p>
        )}

        <p className="mb-4 text-xs text-white/50">
          Tuition and other fees stay as they are. If this student already paid more hostel, mess, or transport than the months they stayed, that extra is adjusted onto the new fees. The original receipt lines stay the same.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={blocked}
            className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
          >
            {saving ? "Converting…" : `Convert to ${toTitle}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
