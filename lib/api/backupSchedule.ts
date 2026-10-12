import { apiGet, apiPost, apiPut } from "./http";

export type BackupSchedule = {
  enabled: boolean;
  scheduleTime: string;
  recipient: string;
  schoolId: string | null;
  schoolName: string | null;
  lastSentAt: string | null;
};

export type BackupScheduleResponse = {
  schedule?: BackupSchedule;
  message?: string;
};

export function fetchBackupSchedule() {
  return apiGet<BackupScheduleResponse>("/api/superadmin/backup-schedule", { cache: "no-store" });
}

export function saveBackupSchedule(patch: Partial<BackupSchedule>) {
  return apiPut<BackupScheduleResponse>("/api/superadmin/backup-schedule", patch);
}

export type SendBackupEmailResponse = {
  message?: string;
  schoolsSent?: string[];
};

export function sendBackupEmailNow(payload: { recipient: string; schoolId: string | null }) {
  return apiPost<SendBackupEmailResponse>("/api/superadmin/backup/email", payload);
}
