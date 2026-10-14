export interface CertificateRequest {
  id: string;
  certificateType: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt?: string;
  issuedDate: string | null;
  tcDocumentUrl: string | null;
  student: {
    user: { name: string | null };
  };
}

export interface Certificate {
  id: string;
  title: string;
  description: string | null;
  issuedDate: string;
  certificateUrl: string | null;
  student: {
    user: { name: string | null };
  };
}

export const certificateTypes = [
  { value: "TRANSFER", label: "Transfer Certificate (TC)" },
  { value: "BONAFIDE", label: "Bonafide Certificate" },
  { value: "CHARACTER", label: "Character Certificate" },
  { value: "CONDUCT", label: "Conduct Certificate" },
  { value: "MIGRATION", label: "Migration Certificate" },
  { value: "LEAVING", label: "Leaving Certificate" },
  { value: "PROVISIONAL", label: "Provisional Certificate" },
  { value: "ATTENDANCE", label: "Attendance Certificate" },
  { value: "MEDICAL", label: "Medical Certificate" },
  { value: "SPORTS", label: "Sports Certificate" },
  { value: "ACHIEVEMENT", label: "Achievement Certificate" },
  { value: "OTHER", label: "Other" },
];

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
