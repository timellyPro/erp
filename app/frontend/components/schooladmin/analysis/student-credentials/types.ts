import type { StudentCredentialRow } from "@/lib/computeStudentCredentials";

export type ClassItem = { id: string; name: string; section: string | null };

export type ExportFormat = "xlsx" | "csv" | "pdf";

export type CredentialsFilterBody = {
  classId?: string;
  className?: string;
  section?: string;
};

export type { StudentCredentialRow };
