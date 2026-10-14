import nodemailer from "nodemailer";
import { tenantDb as prisma } from "@/lib/db/tenantContext";
import { buildFeesBackupEmailContent } from "@/lib/fees/feesBackupEmailTemplate";
import { generateSchoolFeesBackupBuffer, type SchoolFeesBackupFile } from "@/lib/fees/generateSchoolFeesBackupBuffer";
import { logger } from "@/lib/logger";

export type SendFeesBackupEmailResult = {
  ok: boolean;
  recipient: string;
  schoolsSent: string[];
  error?: string;
  messageId?: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER?.trim();
  // Gmail app passwords may be pasted with spaces
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "").trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    return null;
  }

  return { host, port, user, pass, from };
}

function createTransporter(smtp: NonNullable<ReturnType<typeof getSmtpConfig>>) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port === 587,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

async function resolveSchoolIds(schoolId: string | null | undefined): Promise<string[]> {
  if (schoolId) return [schoolId];
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return schools.map((s) => s.id);
}

export async function sendFeesBackupEmail(options: {
  recipient: string;
  schoolId?: string | null;
}): Promise<SendFeesBackupEmailResult> {
  const recipient = options.recipient.trim();
  if (!recipient) {
    return { ok: false, recipient, schoolsSent: [], error: "Recipient email is required" };
  }

  const smtp = getSmtpConfig();
  if (!smtp) {
    return {
      ok: false,
      recipient,
      schoolsSent: [],
      error: "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
    };
  }

  const schoolIds = await resolveSchoolIds(options.schoolId);
  if (schoolIds.length === 0) {
    return { ok: false, recipient, schoolsSent: [], error: "No schools found to backup" };
  }

  // Generate one school at a time to avoid exhausting the DB pool
  const attachments: SchoolFeesBackupFile[] = [];
  for (const id of schoolIds) {
    try {
      const file = await generateSchoolFeesBackupBuffer(id);
      if (file) attachments.push(file);
    } catch (err) {
      logger.error("Fees backup generate failed for school", id, err);
    }
  }

  if (attachments.length === 0) {
    return { ok: false, recipient, schoolsSent: [], error: "Could not generate backup files" };
  }

  const transporter = createTransporter(smtp);
  const generatedAt = new Date();
  const { subject, text, html } = buildFeesBackupEmailContent({
    recipient,
    schoolNames: attachments.map((a) => a.schoolName),
    filenames: attachments.map((a) => a.filename),
    generatedAt,
  });

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: `"Timelly ERP" <${smtp.from}>`,
      to: recipient,
      subject,
      text,
      html,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })),
    });

    console.info("Fees backup email sent", {
      to: recipient,
      messageId: info.messageId,
      schools: attachments.map((a) => a.schoolName),
    });

    return {
      ok: true,
      recipient,
      schoolsSent: attachments.map((a) => a.schoolName),
      messageId: info.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    logger.error("Fees backup email send failed:", message);
    return { ok: false, recipient, schoolsSent: [], error: message };
  }
}

export async function getOrCreateBackupSchedule() {
  const existing = await prisma.backupEmailSchedule.findFirst({
    orderBy: { createdAt: "asc" },
    include: { school: { select: { id: true, name: true } } },
  });
  if (existing) return existing;

  return prisma.backupEmailSchedule.create({
    data: {
      enabled: false,
      scheduleTime: "06:00",
      recipient: "timelly26@gmail.com",
    },
    include: { school: { select: { id: true, name: true } } },
  });
}
