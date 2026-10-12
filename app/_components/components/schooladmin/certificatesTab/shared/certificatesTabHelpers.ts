import type { CertificateRequestListItem } from "../../Certificates";

export type TabStatus = "pending" | "approved" | "rejected";

export const STATUS_MAP: Record<string, TabStatus> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function classNameDisplay(req: CertificateRequestListItem): string {
  const c = req.student?.class;
  if (!c) return "—";
  return c.section ? `${c.name}-${c.section}` : c.name;
}

export function getCertificateTypeLabel(type: string | null | undefined): string {
  if (!type) return "Certificate";

  // Map certificate type values to their display labels (matching parent component dropdown)
  const typeMap: Record<string, string> = {
    "TRANSFER": "Transfer Certificate (TC)",
    "BONAFIDE": "Bonafide Certificate",
    "CHARACTER": "Character Certificate",
    "CONDUCT": "Conduct Certificate",
    "MIGRATION": "Migration Certificate",
    "LEAVING": "Leaving Certificate",
    "PROVISIONAL": "Provisional Certificate",
    "ATTENDANCE": "Attendance Certificate",
    "MEDICAL": "Medical Certificate",
    "SPORTS": "Sports Certificate",
    "ACHIEVEMENT": "Achievement Certificate",
    "OTHER": "Other",
  };

  // Check exact match first (case-sensitive)
  if (typeMap[type]) {
    return typeMap[type];
  }

  // Check case-insensitive match
  const upperType = type.toUpperCase();
  if (typeMap[upperType]) {
    return typeMap[upperType];
  }

  // If no match found, return the original type or default
  return type || "Certificate";
}
