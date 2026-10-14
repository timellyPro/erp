import {
  buildSchoolFeesBackupWorkbook,
  schoolFeesBackupFilename,
} from "@/lib/fees/buildSchoolFeesBackupWorkbook";
import { loadSchoolFeesBackupData } from "@/lib/fees/loadSchoolFeesBackupData";

export type SchoolFeesBackupFile = {
  buffer: Buffer;
  filename: string;
  schoolName: string;
  schoolId: string;
};

export async function generateSchoolFeesBackupBuffer(
  schoolId: string
): Promise<SchoolFeesBackupFile | null> {
  const data = await loadSchoolFeesBackupData(schoolId);
  if (!data) return null;

  const workbook = await buildSchoolFeesBackupWorkbook(data);
  const buf = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as ArrayBuffer);

  return {
    buffer,
    filename: schoolFeesBackupFilename(data.school.name),
    schoolName: data.school.name,
    schoolId,
  };
}
