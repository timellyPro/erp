import { formatResidencyTypeForDisplay } from "@/lib/students/residencyDisplay";
import type { AdmissionRow } from "./types";

export function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot).replace(/\D/g, "");
  const frac = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`;
}

export function formatInrCell(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `₹ ${Number(n).toLocaleString("en-IN")}`;
}

export function formatGradeLabel(g: string) {
  return g.replace(/^GRADE_/i, "Grade ").replace(/_/g, " ");
}

export function formatBoardingLabel(b: string) {
  return b
    .split("_")
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");
}

export function classLabel(r: AdmissionRow) {
  if (r.class?.name) {
    return r.class.section ? `${r.class.name} · ${r.class.section}` : r.class.name;
  }
  return "—";
}

export function normalizeResidencyType(value: string | null | undefined): string {
  const v = (value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!v) return "Day Scholar";
  if (v === "dayscholar" || v === "dayscholer") return "Day Scholar";
  if (v === "hostel" || v === "hostler" || v === "hosteler" || v === "hosteller" || v === "hoster") return "Hosteller";
  if (v === "rte") return "RTE";
  return value?.trim() || "Day Scholar";
}

export function displayResidencyType(value: string | null | undefined): string {
  return formatResidencyTypeForDisplay(normalizeResidencyType(value));
}
