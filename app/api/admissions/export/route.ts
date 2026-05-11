import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";
import * as XLSX from "xlsx";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";
import {
  admissionListWhereSql,
  admissionRawIdsPage,
  studentApplicationHasWorkflowColumn,
} from "@/lib/admissionsListQuery";

function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function formatGrade(value: string) {
  return value.replace(/^GRADE_/i, "Grade ").replace(/_/g, " ");
}

function formatBoardingType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeResidencyType(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "Day Scholar";
  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "dayscholar" || normalized === "dayscholer") return "Day Scholar";
  if (
    normalized === "hostel" ||
    normalized === "hostler" ||
    normalized === "hosteler" ||
    normalized === "hosteller" ||
    normalized === "hoster"
  ) {
    return "Hosteller";
  }
  return raw;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const gradeSought = (searchParams.get("gradeSought") ?? "").trim();
    const boardingType = (searchParams.get("boardingType") ?? "").trim();
    const classId = (searchParams.get("classId") ?? "").trim();
    const phaseRaw = (searchParams.get("phase") ?? "").trim().toLowerCase();
    const phase =
      phaseRaw === "pending" || phaseRaw === "upcoming" || phaseRaw === "approved"
        ? (phaseRaw as "pending" | "upcoming" | "approved")
        : ("" as const);
    const format = (searchParams.get("format") ?? "xlsx").trim().toLowerCase();
    const unconvertedOnly = (searchParams.get("unconvertedOnly") ?? "").trim() === "1";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const toDateEnd = toDate && !Number.isNaN(toDate.getTime())
      ? (() => {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          return end;
        })()
      : null;

    let rows = await prisma.studentApplication.findMany({
      where: {
        schoolId,
        ...(unconvertedOnly ? { studentId: null } : {}),
        ...(phase === "approved" ? { studentId: { not: null } } : {}),
        ...(gradeSought ? { gradeSought: gradeSought as never } : {}),
        ...(boardingType ? { boardingType: boardingType as never } : {}),
        ...(classId ? { classId } : {}),
        ...((fromDate && !Number.isNaN(fromDate.getTime())) || toDateEnd
          ? {
              createdAt: {
                ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
                ...(toDateEnd ? { lte: toDateEnd } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { applicationNo: { contains: search, mode: "insensitive" } },
                { admissionNo: { contains: search, mode: "insensitive" } },
                { fedenaNo: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { parentName: { contains: search, mode: "insensitive" } },
                { parentPhone: { contains: search, mode: "insensitive" } },
                { aadharNo: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationNo: true,
        fedenaNo: true,
        admissionNo: true,
        gradeSought: true,
        boardingType: true,
        residencyType: true,
        rollNo: true,
        firstName: true,
        middleName: true,
        lastName: true,
        aadharNo: true,
        gender: true,
        dateOfBirth: true,
        firstLanguage: true,
        previousSchoolName: true,
        previousSchoolAddress: true,
        className: true,
        section: true,
        class: { select: { name: true, section: true } },
        totalFee: true,
        discountPercent: true,
        applicationFee: true,
        admissionFee: true,
        applicationFeePaid: true,
        admissionFeePaid: true,
        nationality: true,
        languagesAtHome: true,
        caste: true,
        religion: true,
        parentName: true,
        parentOccupation: true,
        officeAddress: true,
        parentPhone: true,
        parentEmail: true,
        parentAadharNo: true,
        parentWhatsapp: true,
        bankAccountNo: true,
        emergencyFatherNo: true,
        emergencyMotherNo: true,
        emergencyGuardianNo: true,
        houseNo: true,
        street: true,
        city: true,
        town: true,
        state: true,
        pinCode: true,
        createdAt: true,
      },
    });

    // Keep export filter behavior consistent with list for Pending/Upcoming.
    if (phase === "pending" || phase === "upcoming") {
      const hasWorkflowColumn = await studentApplicationHasWorkflowColumn();
      const whereSql = admissionListWhereSql({
        schoolId,
        unconvertedOnly,
        phase,
        gradeSought,
        boardingType,
        classId,
        fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null,
        toDateEnd,
        search,
        hasWorkflowColumn,
      });
      const ids = await admissionRawIdsPage(whereSql, 0, 100000);
      if (ids.length === 0) rows = [];
      else {
        const byId = new Map(rows.map((r) => [r.id, r]));
        rows = ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
      }
    }

    const data = rows.map((r) => ({
      // Full admission export fields
      "Application No": r.applicationNo,
      "Fedena No": r.fedenaNo ?? "",
      "Admission No": r.admissionNo ?? "",
      "Grade Sought": formatGrade(r.gradeSought),
      "Boarding Type": formatBoardingType(r.boardingType),
      "Residency Type": formatResidencyTypeForDisplay(normalizeResidencyType(r.residencyType)),
      Class: r.class?.name ?? r.className ?? "",
      Section: r.class?.section ?? r.section ?? "",
      "First Name": r.firstName,
      "Middle Name": r.middleName ?? "",
      "Last Name": r.lastName,
      Gender: r.gender === "MALE" ? "Male" : "Female",
      "Date of Birth": formatDate(r.dateOfBirth),
      "Aadhar No": r.aadharNo,
      "First Language": r.firstLanguage,
      "Total Fee": r.totalFee ?? "",
      "Discount %": r.discountPercent ?? 0,
      "Application Fee": r.applicationFee ?? "",
      "Admission Fee": r.admissionFee ?? "",
      "Application Fee Paid Amount": r.applicationFeePaid ? (r.applicationFee ?? 0) : 0,
      "Admission Fee Paid Amount": r.admissionFeePaid ? (r.admissionFee ?? 0) : 0,
      Nationality: r.nationality,
      "Languages at Home": r.languagesAtHome,
      Caste: r.caste ?? "",
      Religion: r.religion ?? "",
      "House No": r.houseNo,
      Street: r.street,
      City: r.city,
      Town: r.town ?? "",
      State: r.state,
      "Pin Code": r.pinCode,
      "Parent Name": r.parentName,
      Occupation: r.parentOccupation,
      "Office Address": r.officeAddress,
      "Parent Phone": r.parentPhone,
      "Parent Email": r.parentEmail,
      "Parent Aadhar No": r.parentAadharNo,
      WhatsApp: r.parentWhatsapp,
      "Bank Account No": r.bankAccountNo,
      "Previous School Name": r.previousSchoolName,
      "Previous School Address": r.previousSchoolAddress,
      "Father No": r.emergencyFatherNo,
      "Mother No": r.emergencyMotherNo,
      "Guardian No": r.emergencyGuardianNo,
    }));

    if (format === "csv") {
      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const filename = `admissions-${Date.now()}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (format === "print") {
      const cols = data.length > 0 ? Object.keys(data[0]) : ["Application No", "First Name", "Last Name"];
      const rowsHtml = data
        .map((row) => {
          const tds = cols.map((c) => `<td>${String((row as Record<string, unknown>)[c] ?? "")}</td>`).join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");
      const activeFilters = [
        search ? `Search: ${search}` : null,
        gradeSought ? `Grade: ${formatGrade(gradeSought)}` : null,
        boardingType ? `Boarding: ${formatBoardingType(boardingType)}` : null,
        classId ? "Class: Applied filter" : null,
        phase ? `Phase: ${phase.charAt(0).toUpperCase()}${phase.slice(1)}` : null,
        fromDate && !Number.isNaN(fromDate.getTime()) ? `From: ${formatDate(fromDate)}` : null,
        toDateEnd ? `To: ${formatDate(toDateEnd)}` : null,
      ].filter(Boolean) as string[];
      const filtersHtml = activeFilters.length
        ? activeFilters.map((f) => `<span class="chip">${f}</span>`).join("")
        : `<span class="chip">No filters</span>`;
      const generatedAt = new Date().toLocaleString("en-IN");
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Admissions Export</title>
<style>
*{box-sizing:border-box}
body{font-family:Inter,Arial,sans-serif;padding:18px;background:#f7f8fb;color:#111827}
.sheet{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px}
.header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
.title{font-size:24px;font-weight:800;letter-spacing:.2px;margin:0}
.sub{margin-top:2px;color:#6b7280;font-size:12px}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.chip{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #dbe2ea;background:#f8fafc;font-size:11px;color:#334155}
.meta{font-size:11px;color:#64748b;text-align:right}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:11px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
th,td{border-bottom:1px solid #edf0f4;border-right:1px solid #edf0f4;padding:7px 8px;vertical-align:top;text-align:left}
th:last-child,td:last-child{border-right:none}
tbody tr:last-child td{border-bottom:none}
th{background:#f3f5f8;font-weight:700;color:#374151;position:sticky;top:0;z-index:1}
tbody tr:nth-child(odd){background:#fcfdff}
.foot{margin-top:10px;font-size:10px;color:#94a3b8}
@media print{
  body{padding:0;background:#fff}
  .sheet{border:none;border-radius:0;padding:0}
  .title{font-size:20px}
  th{position:static}
}
</style></head>
<body>
<div class="sheet">
  <div class="header">
    <div>
      <h1 class="title">Admissions Register</h1>
      <div class="sub">School Admissions Export</div>
      <div class="stats">
        <span class="chip"><strong style="margin-right:6px">Total Applications</strong>${data.length}</span>
        ${filtersHtml}
      </div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> ${generatedAt}</div>
      <div style="margin-top:4px"><strong>Format:</strong> Print / PDF</div>
    </div>
  </div>
  <table>
    <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot">Generated by Timelly admissions export.</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Admissions");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const body = new Uint8Array(buf);
    const filename = `admissions-${Date.now()}.xlsx`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}

