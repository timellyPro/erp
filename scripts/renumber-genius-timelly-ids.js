/**
 * Renumber Genius Best Foundation School Timelly IDs (rollNo + admissionNumber)
 * Pattern:
 *   NURSERY -> GN001+
 *   LKG     -> GN100+
 *   UKG     -> GN200+
 *   CLASS 1 -> GN300+
 *   CLASS 2 -> GN400+
 *   CLASS n -> GN{(n+2)*100}+
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

process.env.DATABASE_URL = process.env.DIRECT_URL;
const prisma = new PrismaClient();

const SCHOOL_ID = "cmrk8erq10001jo04eongvwvz";
const APPLY = process.argv.includes("--apply");

function classBase(name) {
  const n = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (n === "NURSERY" || n === "PRE-NURSERY" || n === "PRE NURSERY") return 1;
  if (n === "LKG") return 100;
  if (n === "UKG") return 200;
  const m = n.match(/^CLASS\s*(\d+)$/) || n.match(/^(\d+)$/);
  if (m) {
    const grade = Number(m[1]);
    if (grade >= 1 && grade <= 20) return (grade + 2) * 100;
  }
  return null;
}

function formatGn(num) {
  return "GN" + String(num).padStart(3, "0");
}

function parseRollNum(rollNo) {
  const m = String(rollNo || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function main() {
  const students = await prisma.student.findMany({
    where: { schoolId: SCHOOL_ID },
    select: {
      id: true,
      rollNo: true,
      admissionNumber: true,
      createdAt: true,
      class: { select: { name: true, section: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  const groups = new Map();
  for (const s of students) {
    const cname = s.class?.name || "UNASSIGNED";
    if (!groups.has(cname)) groups.set(cname, []);
    groups.get(cname).push(s);
  }

  const plan = [];
  for (const [cname, rows] of groups) {
    const base = classBase(cname);
    if (base == null) {
      console.log("SKIP unknown class:", cname, "count", rows.length);
      continue;
    }

    rows.sort((a, b) => {
      const sa = a.class?.section || "";
      const sb = b.class?.section || "";
      if (sa !== sb) return sa.localeCompare(sb);
      const na = parseRollNum(a.rollNo);
      const nb = parseRollNum(b.rollNo);
      if (na !== nb) return na - nb;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    rows.forEach((s, i) => {
      const newRoll = formatGn(base + i);
      const parts = String(s.admissionNumber || "").split("/");
      const prefix = parts[0] || "ADM";
      const year = parts[1] && /^\d{4}$/.test(parts[1]) ? parts[1] : "2026";
      const newAdm = `${prefix}/${year}/${newRoll}`;
      if (s.rollNo !== newRoll || s.admissionNumber !== newAdm) {
        plan.push({
          id: s.id,
          name: s.user?.name,
          class: `${cname}${s.class?.section ? `-${s.class.section}` : ""}`,
          fromRoll: s.rollNo,
          toRoll: newRoll,
          fromAdm: s.admissionNumber,
          toAdm: newAdm,
        });
      }
    });
  }

  console.log("students total:", students.length);
  console.log("changes planned:", plan.length);
  const by = {};
  for (const r of plan) {
    const k = r.class.replace(/-[A-Z]$/, "");
    by[k] = (by[k] || 0) + 1;
  }
  console.log("changes by class:", by);
  console.log("sample:", JSON.stringify(plan.slice(0, 15), null, 2));
  fs.writeFileSync("/tmp/genius-gn-plan.json", JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  // Two-phase to avoid unique conflicts on admissionNumber
  console.log("\nPhase 1: temp admission numbers...");
  for (const row of plan) {
    await prisma.student.update({
      where: { id: row.id },
      data: {
        rollNo: `TMP-${row.id.slice(-8)}`,
        admissionNumber: `TMP/${row.id}`,
      },
    });
  }

  console.log("Phase 2: final GN ids...");
  for (const row of plan) {
    await prisma.student.update({
      where: { id: row.id },
      data: {
        rollNo: row.toRoll,
        admissionNumber: row.toAdm,
      },
    });
  }

  // Verify
  const after = await prisma.student.findMany({
    where: { schoolId: SCHOOL_ID },
    select: {
      rollNo: true,
      admissionNumber: true,
      class: { select: { name: true, section: true } },
    },
  });
  const summary = {};
  for (const s of after) {
    const key = s.class?.name || "NONE";
    if (!summary[key]) summary[key] = [];
    summary[key].push(s.rollNo);
  }
  for (const [k, rolls] of Object.entries(summary)) {
    const nums = rolls
      .map((r) => parseRollNum(r))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    console.log(
      k,
      "count=" + rolls.length,
      nums.length ? `range GN${String(nums[0]).padStart(3, "0")}-GN${String(nums[nums.length - 1]).padStart(3, "0")}` : ""
    );
  }
  console.log("DONE");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
