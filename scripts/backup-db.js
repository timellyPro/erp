/**
 * Dumps every table's data to a timestamped JSON file under /backups.
 * Load env from .env if present. Run from project root:
 *   node scripts/backup-db.js
 *
 * Intended to run once a day (see Windows Task Scheduler / cron setup in README or ask Claude).
 * Keeps the last 30 backups and deletes older ones automatically.
 */
const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const RETENTION_COUNT = 30;

// Every model exposed on the Prisma client, in $ / _ free lowercase form
// (matches prisma.<modelName>.findMany usage below).
const MODELS = [
  "user", "notification", "teacherAuditRecord", "leaveRequest", "school",
  "backupEmailSchedule", "schoolSettings", "circular", "studentLeaveRequest",
  "class", "timetable", "timetableEntry", "examTerm", "examTermSection",
  "examSchedule", "syllabusTracking", "syllabusUnit", "student", "account",
  "session", "verificationToken", "attendance", "mark", "markComponent",
  "examType", "examTypeSection", "examSubject", "event", "eventRegistration",
  "newsFeed", "newsFeedLike", "homework", "homeworkSubmission",
  "certificateTemplate", "certificate", "transferCertificate", "studentHistory",
  "appointment", "chatMessage", "studentFee", "feeDiscountApproval",
  "classFeeStructure", "extraFee", "extraFeeHeadTemplate", "pettyCashExpense",
  "payment", "paymentFeeAllocation", "parentSubscription", "paymentWebhookEvent",
  "refund", "studentApplication",
];

async function main() {
  const backupsDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(backupsDir, `backup-${timestamp}.json`);

  const data = {};
  for (const model of MODELS) {
    if (typeof prisma[model]?.findMany !== "function") {
      console.warn(`Skipping unknown model: ${model}`);
      continue;
    }
    try {
      data[model] = await prisma[model].findMany();
      console.log(`Backed up ${model}: ${data[model].length} rows`);
    } catch (err) {
      console.error(`Failed to back up ${model}:`, err.message);
      data[model] = { error: err.message };
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
  console.log(`\nBackup written to ${outFile}`);

  // Prune old backups, keeping only the most recent RETENTION_COUNT files.
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
    .sort()
    .reverse();
  for (const old of files.slice(RETENTION_COUNT)) {
    fs.unlinkSync(path.join(backupsDir, old));
    console.log(`Pruned old backup: ${old}`);
  }
}

main()
  .catch((err) => {
    console.error("Backup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
