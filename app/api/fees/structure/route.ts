import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { computeStudentTuitionTotalFee } from "@/lib/studentTuitionFromStructure";

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    const where: { schoolId: string; classId?: string } = { schoolId };
    if (classId) where.classId = classId;

    const structures = await prisma.classFeeStructure.findMany({
      where,
      include: { class: { select: { id: true, name: true, section: true } } },
    });

    return NextResponse.json({ structures });
  } catch (error: any) {
    console.error("Fee structure GET error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
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

    const body = await req.json();
    const { classId, components } = body;

    if (!classId || !Array.isArray(components)) {
      return NextResponse.json(
        { message: "classId and components (array) required" },
        { status: 400 }
      );
    }

    const classInSchool = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true },
    });
    if (!classInSchool) {
      return NextResponse.json(
        { message: "Class not found in your school" },
        { status: 404 }
      );
    }

    const normalizedComponents = components
      .map((c: any) => {
        const name = typeof c?.name === "string" ? c.name.trim() : "";
        const rawAmount = c?.amount;
        const amount =
          typeof rawAmount === "number" ? rawAmount : rawAmount != null ? Number(rawAmount) : NaN;
        return { name, amount };
      })
      .filter((c: { name: string; amount: number }) => c.name.length > 0 && Number.isFinite(c.amount));

    if (normalizedComponents.length === 0) {
      return NextResponse.json(
        { message: "Each component must have name and a valid numeric amount" },
        { status: 400 }
      );
    }

    // IMPORTANT: avoid one huge long transaction (can timeout on some DB setups).
    // We still update studentFee records, but without a single global $transaction wrapper.
    const structure = await prisma.classFeeStructure.upsert({
      where: { classId },
      create: { schoolId, classId, components: normalizedComponents as object[] },
      update: { components: normalizedComponents as object[] },
      include: { class: { select: { id: true, name: true, section: true } } },
    });

    const students = await prisma.student.findMany({
      where: { classId, schoolId },
      include: {
        class: { select: { section: true } },
        fee: true,
      },
    });

    // Update in small parallel batches for speed.
    // Avoids the single huge transaction + reduces wall time significantly.
    const chunkSize = 8;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (student) => {
          const fee = student.fee;
          if (!fee) return;

          const newTotalFee = await computeStudentTuitionTotalFee(prisma, {
            schoolId,
            classId,
            section: student.class?.section ?? null,
            studentId: student.id,
          });
          const discount = (fee.discountPercent || 0) / 100;
          const newFinalFee = Math.round(newTotalFee * (1 - discount) * 100) / 100;
          const newRemainingFee = Math.max(0, newFinalFee - fee.amountPaid);

          await prisma.studentFee.update({
            where: { studentId: student.id },
            data: {
              totalFee: newTotalFee,
              finalFee: newFinalFee,
              remainingFee: newRemainingFee,
            },
          });
        })
      );
    }

    return NextResponse.json({ structure });
  } catch (error: any) {
    console.error("Fee structure PUT error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ message: "classId required" }, { status: 400 });
    }

    // Avoid long interactive transactions (can throw P2028 "Transaction not found")
    // when many student fee rows are updated.
    await prisma.classFeeStructure.deleteMany({
      where: { classId, schoolId },
    });

    const students = await prisma.student.findMany({
      where: { classId, schoolId },
      include: { class: { select: { section: true } }, fee: true },
    });

    const extraFees = await prisma.extraFee.findMany({
      where: { schoolId },
      select: {
        amount: true,
        targetType: true,
        targetClassId: true,
        targetSection: true,
        targetStudentId: true,
      },
    });

    const chunkSize = 8;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (student) => {
          const fee = student.fee;
          if (!fee) return;

          let extraTotal = 0;
          for (const ef of extraFees) {
            const applies =
              ef.targetType === "SCHOOL" ||
              (ef.targetType === "CLASS" && ef.targetClassId === classId) ||
              (ef.targetType === "SECTION" &&
                ef.targetClassId === classId &&
                ef.targetSection === student.class?.section) ||
              (ef.targetType === "STUDENT" && ef.targetStudentId === student.id);
            if (applies) extraTotal += ef.amount;
          }

          const discount = (fee.discountPercent || 0) / 100;
          const newFinalFee = Math.round(extraTotal * (1 - discount) * 100) / 100;
          const newRemainingFee = Math.max(0, newFinalFee - fee.amountPaid);

          await prisma.studentFee.update({
            where: { studentId: student.id },
            data: {
              totalFee: extraTotal,
              finalFee: newFinalFee,
              remainingFee: newRemainingFee,
            },
          });
        })
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fee structure DELETE error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
