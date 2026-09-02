import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { saveClassFeeStructureAndSyncStudents } from "@/lib/classFeeStructureApply";

function normHeader(k: string) {
  return k
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[₹()]/g, "");
}

/** Map header variants to canonical keys */
function rowToFields(row: Record<string, unknown>) {
  const m: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    m[normHeader(k)] = v;
  }
  const className = String(
    m["classname"] ?? m["class"] ?? m["class name"] ?? m["class_name"] ?? ""
  ).trim();
  const section = String(m["section"] ?? m["sec"] ?? "").trim();
  const componentName = String(
    m["componentname"] ??
      m["fee head"] ??
      m["feehead"] ??
      m["head"] ??
      m["component"] ??
      m["fee name"] ??
      ""
  ).trim();
  const rawAmt =
    m["amount"] ?? m["amount rs"] ?? m["amountrs"] ?? m["rupees"] ?? m["fee amount"] ?? "";
  let amount: number | null = null;
  if (rawAmt != null && rawAmt !== "") {
    const n =
      typeof rawAmt === "number" ? rawAmt : Number(String(rawAmt).replace(/,/g, "").trim());
    amount = Number.isFinite(n) ? n : null;
  }
  return { className, section, componentName, amount };
}

function resolveClassId(
  classes: Array<{ id: string; name: string; section: string | null }>,
  className: string,
  sectionRaw: string
): string | null {
  const sec = sectionRaw.trim() === "" ? null : sectionRaw.trim();
  const cn = className.trim();
  const c = classes.find(
    (x) => x.name.trim() === cn && (x.section ?? "") === (sec ?? "")
  );
  return c?.id ?? null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ message: "Excel file required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstName = workbook.SheetNames[0];
    if (!firstName) {
      return NextResponse.json({ message: "Excel workbook has no sheets" }, { status: 400 });
    }
    const sheet = workbook.Sheets[firstName];
    if (!sheet) {
      return NextResponse.json({ message: "Could not read the first worksheet" }, { status: 400 });
    }
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
    if (!rows.length) {
      return NextResponse.json({ message: "Excel sheet is empty" }, { status: 400 });
    }

    const classes = await prisma.class.findMany({
      where: { schoolId },
      select: { id: true, name: true, section: true },
    });

    type Comp = { name: string; amount: number };
    const byClassId = new Map<string, Comp[]>();
    const failed: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = i + 2;
      const { className, section, componentName, amount } = rowToFields(row);

      if (!className || className.startsWith("*")) continue;

      const classId = resolveClassId(classes, className, section);
      if (!classId) {
        failed.push({
          row: excelRow,
          message: `No class matches "${className}"${section ? ` / section "${section}"` : ""}`,
        });
        continue;
      }

      if (!componentName) {
        failed.push({ row: excelRow, message: "ComponentName is empty" });
        continue;
      }

      if (amount == null || !Number.isFinite(amount)) {
        failed.push({ row: excelRow, message: "Amount is missing or not a number" });
        continue;
      }

      const list = byClassId.get(classId) ?? [];
      list.push({ name: componentName, amount });
      byClassId.set(classId, list);
    }

    const updated: Array<{ classId: string; label: string; components: number }> = [];

    for (const [classId, comps] of byClassId) {
      if (comps.length === 0) continue;
      const mergeMap = new Map<string, number>();
      for (const c of comps) {
        mergeMap.set(c.name.trim(), c.amount);
      }
      const merged = [...mergeMap.entries()].map(([name, amount]) => ({ name, amount }));
      try {
        await saveClassFeeStructureAndSyncStudents({
          schoolId,
          classId,
          components: merged,
        });
        const cls = classes.find((c) => c.id === classId);
        const label = cls
          ? `Class ${cls.name}${cls.section ? `-${cls.section}` : ""}`
          : classId;
        updated.push({ classId, label, components: merged.length });
      } catch (e: any) {
        failed.push({
          row: 0,
          message: `${classes.find((c) => c.id === classId)?.name ?? classId}: ${e?.message || "Save failed"}`,
        });
      }
    }

    if (updated.length === 0 && failed.length === 0) {
      return NextResponse.json(
        { message: "No valid data rows found. Use columns ClassName, Section, ComponentName, Amount." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      updatedClasses: updated.length,
      updated,
      failed,
    });
  } catch (error: any) {
    console.error("Fee structure bulk POST error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
