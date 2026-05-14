import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { upsertStudentFeeFromStructure } from "@/lib/studentTuitionFromStructure";

type RouteParams =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

function normalizeResidencyType(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
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

export async function GET(_req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature = session.user.role === "TEACHER" && (session.user.allowedFeatures?.includes("STUDENTS") || session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  const isOwnStudent = session.user.studentId === id;

  if (!isAdmin && !isOwnStudent && !hasFeature) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    let schoolId = session.user.schoolId;
    if (!schoolId && isAdmin) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }

    const whereClause = schoolId ? { id, schoolId } : { id };
    const student = await prisma.student.findFirst({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true, photoUrl: true } },
        class: { select: { id: true, name: true, section: true } },
        school: { select: { name: true } },
        fee: true,
        application: {
          select: {
            parentEmail: true,
            officeAddress: true,
            parentAadharNo: true,
            parentWhatsapp: true,
            bankAccountNo: true,
            houseNo: true,
            street: true,
            city: true,
            town: true,
            state: true,
            pinCode: true,
            nationality: true,
            languagesAtHome: true,
            caste: true,
            religion: true,
            emergencyFatherNo: true,
            emergencyMotherNo: true,
            emergencyGuardianNo: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    // Some legacy rows may not have the StudentApplication relation linked via `studentId`.
    // Fall back by Aadhaar within school so parent/mother contact still appears in profile.
    const fallbackApplication =
      student.application ??
      (await prisma.studentApplication.findFirst({
        where: {
          schoolId: student.schoolId,
          aadharNo: student.aadhaarNo,
        },
        select: {
          emergencyMotherNo: true,
        },
        orderBy: { updatedAt: "desc" },
      }));

    const motherPhoneRaw = String(fallbackApplication?.emergencyMotherNo ?? "").trim();
    const motherPhoneResolved =
      !motherPhoneRaw || motherPhoneRaw === "-" || motherPhoneRaw === "—" ? "" : motherPhoneRaw;

    const payments = await prisma.payment.findMany({
      where: { studentId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // For each payment row, show which fee heads were allocated
    // (e.g., Tuition, Lab, Uniform, etc.) by using PaymentFeeAllocation.
    const paymentIds = payments.map((p) => p.id);
    const paymentAllocations =
      paymentIds.length > 0
        ? await prisma.paymentFeeAllocation.findMany({
            where: {
              paymentId: { in: paymentIds },
              allocationType: "PAYMENT",
            },
            select: {
              paymentId: true,
              headType: true,
              componentIndex: true,
              componentName: true,
              extraFeeId: true,
              allocatedAmount: true,
            },
          })
        : [];
    const refundAllocations =
      paymentIds.length > 0
        ? await prisma.paymentFeeAllocation.findMany({
            where: {
              paymentId: { in: paymentIds },
              allocationType: "REFUND",
            },
            select: {
              paymentId: true,
              headType: true,
              componentIndex: true,
              allocatedAmount: true,
            },
          })
        : [];

    const extraFeeIds = Array.from(
      new Set(
        paymentAllocations
          .filter((a) => a.headType === "EXTRA_FEE" && !!a.extraFeeId)
          .map((a) => a.extraFeeId as string)
      )
    );

    const extraFees =
      extraFeeIds.length > 0
        ? await prisma.extraFee.findMany({
            where: { id: { in: extraFeeIds } },
            select: { id: true, name: true },
          })
        : [];

    const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

    const feeHeadAmountsByPaymentId = new Map<string, Map<string, number>>();

    for (const a of paymentAllocations) {
      if (a.allocatedAmount <= 0.00001) continue;

      let label: string | null = null;
      if (a.headType === "BASE_COMPONENT") {
        if (a.componentName) label = a.componentName;
        else if (typeof a.componentIndex === "number") label = `Component ${a.componentIndex + 1}`;
        else label = "Base Component";
      } else if (a.headType === "EXTRA_FEE") {
        label = a.extraFeeId ? extraFeeNameById.get(a.extraFeeId) ?? "Extra Fee" : "Extra Fee";
      }

      if (!label) continue;

      const perPayment = feeHeadAmountsByPaymentId.get(a.paymentId) ?? new Map<string, number>();
      feeHeadAmountsByPaymentId.set(a.paymentId, perPayment);
      perPayment.set(label, (perPayment.get(label) ?? 0) + a.allocatedAmount);
    }

    const feeTypeNameAmountByPaymentId = new Map<string, { name: string; amount: number }>();
    for (const [paymentId, headMap] of feeHeadAmountsByPaymentId.entries()) {
      let bestName = "-";
      let bestAmount = 0;
      for (const [name, amount] of headMap.entries()) {
        if (amount > bestAmount) {
          bestAmount = amount;
          bestName = name;
        }
      }
      if (bestAmount > 0.00001) feeTypeNameAmountByPaymentId.set(paymentId, { name: bestName, amount: bestAmount });
    }

    const tuitionPaidFromAllocations =
      paymentAllocations
        .filter((a) => a.headType === "BASE_COMPONENT" && a.componentIndex === -1)
        .reduce((s, a) => s + a.allocatedAmount, 0) -
      refundAllocations
        .filter((a) => a.headType === "BASE_COMPONENT" && a.componentIndex === -1)
        .reduce((s, a) => s + a.allocatedAmount, 0);

    const attendances = await prisma.attendance.findMany({
      where: { studentId: id },
      orderBy: { date: "desc" },
      take: 90,
    });

    const marks = await prisma.mark.findMany({
      where: { studentId: id },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const certificates = await prisma.certificate.findMany({
      where: { studentId: id },
      include: {
        template: { select: { name: true } },
        issuedBy: { select: { name: true } },
      },
      orderBy: { issuedDate: "desc" },
    });

    const dob = student.dob ? new Date(student.dob) : null;
    const age = dob
      ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;

    const attendanceByMonth = attendances.reduce(
      (acc, a) => {
        const key = a.date.toISOString().slice(0, 7);
        if (!acc[key]) acc[key] = { present: 0, total: 0 };
        acc[key].total += 1;
        if (a.status === "PRESENT" || a.status === "LATE") acc[key].present += 1;
        return acc;
      },
      {} as Record<string, { present: number; total: number }>
    );

    const attendanceTrends = Object.entries(attendanceByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({
        month,
        present: v.present,
        total: v.total,
        pct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      }));

    const marksBySubject = marks.reduce(
      (acc, m) => {
        const key = m.subject;
        if (!acc[key]) acc[key] = { marks: 0, total: 0, count: 0 };
        acc[key].marks += m.marks;
        acc[key].total += m.totalMarks;
        acc[key].count += 1;
        return acc;
      },
      {} as Record<string, { marks: number; total: number; count: number }>
    );

    const academicPerformance = Object.entries(marksBySubject).map(([subject, v]) => ({
      subject,
      score: v.total > 0 ? Math.round((v.marks / v.total) * 100) : 0,
    }));

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.user?.name ?? "",
        schoolName: student.school?.name ?? "",
        admissionNumber: student.admissionNumber,
        email: student.user?.email ?? "",
        photoUrl: student.user?.photoUrl ?? null,
        rollNo: student.rollNo ?? "",
        penNumber: (student as { penNumber?: string | null }).penNumber ?? "",
        apaarId: (student as { apaarId?: string | null }).apaarId ?? "",
        dob: student.dob?.toISOString().slice(0, 10) ?? "",
        age,
        address: student.address ?? "",
        phone: student.phoneNo ?? "",
        fatherName: student.fatherName ?? "",
        motherName: student.motherName ?? "",
        gender: student.gender ?? "",
        fatherOccupation: student.occupation ?? "",
        motherOccupation: student.occupation ?? "",
        fatherPhone: student.phoneNo ?? "",
        motherPhone: motherPhoneResolved,
        previousSchool: student.previousSchool ?? "",
        aadhaarNo: student.aadhaarNo ?? "",
        officeAddress: student.application?.officeAddress ?? "",
        parentAadharNo: student.application?.parentAadharNo ?? "",
        parentWhatsapp: student.application?.parentWhatsapp ?? "",
        bankAccountNo: student.application?.bankAccountNo ?? "",
        houseNo: student.application?.houseNo ?? "",
        street: student.application?.street ?? "",
        city: student.application?.city ?? "",
        town: student.application?.town ?? "",
        state: student.application?.state ?? "",
        pinCode: student.application?.pinCode ?? "",
        nationality: student.application?.nationality ?? "Indian",
        languagesAtHome: student.application?.languagesAtHome ?? "",
        caste: student.application?.caste ?? "",
        religion: student.application?.religion ?? "",
        emergencyFatherNo: student.application?.emergencyFatherNo ?? "",
        emergencyMotherNo: student.application?.emergencyMotherNo ?? "",
        emergencyGuardianNo: student.application?.emergencyGuardianNo ?? "",
        parentEmail: student.application?.parentEmail ?? "",
        residencyType: student.residencyType ?? "Day Scholar",
        applicationFee: student.applicationFee ?? null,
        admissionFee: student.admissionFee ?? null,
        createdAt: student.createdAt?.toISOString() ?? "",
        status: student.status ?? "Active",
        class: student.class
          ? {
              id: student.class.id,
              name: student.class.name,
              section: student.class.section,
              displayName: `${student.class.name}${student.class.section ? `-${student.class.section}` : ""}`,
            }
          : null,
      },
      fee: student.fee
        ? {
            baseTotalFee: student.fee.totalFee,
            discountPercent: student.fee.discountPercent,
            totalFee: student.fee.finalFee,
            amountPaid: student.fee.amountPaid,
            remainingFee: student.fee.remainingFee,
            tuitionPaid:
              tuitionPaidFromAllocations > 0.00001
                ? tuitionPaidFromAllocations
                : student.fee.amountPaid,
            moneyForStudent: (student.fee as { moneyForStudent?: number }).moneyForStudent ?? null,
            discountFeeHeadKey: (student.fee as { discountFeeHeadKey?: string | null }).discountFeeHeadKey ?? null,
            discountFeeHeadLabel: (student.fee as { discountFeeHeadLabel?: string | null }).discountFeeHeadLabel ?? null,
            discountRemarks: (student.fee as { discountRemarks?: string | null }).discountRemarks ?? null,
          }
        : null,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        method: p.gateway ?? "—",
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
        transactionId: p.transactionId ?? null,
        feeTypeName: feeTypeNameAmountByPaymentId.get(p.id)?.name,
        feeTypeAmount: feeTypeNameAmountByPaymentId.get(p.id)?.amount,
      })),
      attendanceTrends,
      academicPerformance,
      certificates: certificates.map((c) => ({
        id: c.id,
        title: c.title,
        issuedDate: c.issuedDate instanceof Date ? c.issuedDate.toISOString().slice(0, 10) : String(c.issuedDate),
        issuedBy: c.issuedBy?.name ?? null,
        certificateUrl: c.certificateUrl ?? null,
      })),
    });
  } catch (error: unknown) {
    console.error("Student details error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role: string } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

export async function PUT(req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature = session.user.role === "TEACHER" && (session.user.allowedFeatures?.includes("STUDENTS") || session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  if (!isAdmin && !hasFeature) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const schoolId = await resolveSchoolId(session);
  if (!schoolId) {
    return NextResponse.json({ message: "School not found" }, { status: 400 });
  }

  try {
    const student = await prisma.student.findFirst({
      where: { id, schoolId },
      include: { user: { select: { id: true } } },
    });
    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const fatherName = typeof body.fatherName === "string" ? body.fatherName.trim() : undefined;
    const motherName = typeof body.motherName === "string" ? body.motherName.trim() || null : undefined;
    const occupation = typeof body.occupation === "string" ? body.occupation.trim() || null : undefined;
    const classId = typeof body.classId === "string" ? (body.classId || null) : undefined;
    const aadhaarNo =
      typeof body.aadhaarNo === "string" ? body.aadhaarNo.replace(/\D/g, "") || null : undefined;
    const dobRaw = typeof body.dob === "string" ? body.dob.trim() : undefined;
    const rollNo = typeof body.rollNo === "string" ? body.rollNo.trim() || null : undefined;
    const penNumber =
      typeof body.penNumber === "string" ? body.penNumber.trim() || null : undefined;
    const apaarId =
      typeof body.apaarId === "string" ? body.apaarId.trim() || null : undefined;
    const phoneNo = typeof body.phoneNo === "string" ? body.phoneNo.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const address = typeof body.address === "string" ? body.address.trim() || null : undefined;
    const gender = typeof body.gender === "string" ? body.gender.trim() || null : undefined;
    const residencyType = normalizeResidencyType(body.residencyType);
    const previousSchool = typeof body.previousSchool === "string" ? body.previousSchool.trim() || null : undefined;
    const status =
      typeof body.status === "string"
        ? body.status.trim().toLowerCase() === "inactive"
          ? "Inactive"
          : "Active"
        : undefined;
    const officeAddress = typeof body.officeAddress === "string" ? body.officeAddress.trim() || null : undefined;
    const parentAadharNo = typeof body.parentAadharNo === "string" ? body.parentAadharNo.trim() || null : undefined;
    const parentWhatsapp = typeof body.parentWhatsapp === "string" ? body.parentWhatsapp.trim() || null : undefined;
    const bankAccountNo = typeof body.bankAccountNo === "string" ? body.bankAccountNo.trim() || null : undefined;
    const houseNo = typeof body.houseNo === "string" ? body.houseNo.trim() || null : undefined;
    const street = typeof body.street === "string" ? body.street.trim() || null : undefined;
    const city = typeof body.city === "string" ? body.city.trim() || null : undefined;
    const town = typeof body.town === "string" ? body.town.trim() || null : undefined;
    const state = typeof body.state === "string" ? body.state.trim() || null : undefined;
    const pinCode = typeof body.pinCode === "string" ? body.pinCode.trim() || null : undefined;
    const nationality = typeof body.nationality === "string" ? body.nationality.trim() || null : undefined;
    const languagesAtHome = typeof body.languagesAtHome === "string" ? body.languagesAtHome.trim() || null : undefined;
    const caste = typeof body.caste === "string" ? body.caste.trim() || null : undefined;
    const religion = typeof body.religion === "string" ? body.religion.trim() || null : undefined;
    const emergencyFatherNo = typeof body.emergencyFatherNo === "string" ? body.emergencyFatherNo.trim() || null : undefined;
    const emergencyMotherNo = typeof body.emergencyMotherNo === "string" ? body.emergencyMotherNo.trim() || null : undefined;
    const emergencyGuardianNo = typeof body.emergencyGuardianNo === "string" ? body.emergencyGuardianNo.trim() || null : undefined;
    const dob = dobRaw
      ? (() => {
          const parsed = new Date(dobRaw);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        })()
      : undefined;
    const parseOptFee = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const applicationFee = parseOptFee(body.applicationFee);
    const admissionFee = parseOptFee(body.admissionFee);

    if (name !== undefined && name.length < 2) {
      return NextResponse.json({ message: "Name must be at least 2 characters" }, { status: 400 });
    }

    if (classId !== undefined && classId) {
      const cls = await prisma.class.findFirst({
        where: { id: classId, schoolId },
      });
      if (!cls) {
        return NextResponse.json({ message: "Class not found" }, { status: 400 });
      }
    }

    if (aadhaarNo !== undefined && aadhaarNo !== null && aadhaarNo.length !== 12) {
      return NextResponse.json({ message: "Aadhaar number must be exactly 12 digits" }, { status: 400 });
    }

    if (dobRaw !== undefined && dob === null) {
      return NextResponse.json({ message: "Invalid date of birth" }, { status: 400 });
    }

    if (dob && dob >= new Date()) {
      return NextResponse.json({ message: "Date of birth must be in the past" }, { status: 400 });
    }

    if (aadhaarNo !== undefined && aadhaarNo !== null) {
      const existing = await prisma.student.findFirst({
        where: {
          schoolId,
          aadhaarNo,
          NOT: { id },
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ message: "Aadhaar number already exists in this school" }, { status: 400 });
      }
    }

    const userUpdate: { name?: string; email?: string } = {};
    if (name !== undefined) userUpdate.name = name;
    if (email !== undefined) userUpdate.email = email;

    const studentUpdate: Record<string, unknown> = {};
    if (fatherName !== undefined) studentUpdate.fatherName = fatherName;
    if (motherName !== undefined) studentUpdate.motherName = motherName;
    if (occupation !== undefined) studentUpdate.occupation = occupation;
    if (classId !== undefined) studentUpdate.classId = classId;
    if (rollNo !== undefined) studentUpdate.rollNo = rollNo;
    if (penNumber !== undefined) studentUpdate.penNumber = penNumber;
    if (apaarId !== undefined) studentUpdate.apaarId = apaarId;
    if (aadhaarNo !== undefined) studentUpdate.aadhaarNo = aadhaarNo;
    if (dob !== undefined) studentUpdate.dob = dob;
    if (phoneNo !== undefined) studentUpdate.phoneNo = phoneNo;
    if (address !== undefined) studentUpdate.address = address;
    if (gender !== undefined) studentUpdate.gender = gender;
    if (residencyType !== undefined) studentUpdate.residencyType = residencyType;
    if (status !== undefined) studentUpdate.status = status;
    if (previousSchool !== undefined) studentUpdate.previousSchool = previousSchool;
    if (applicationFee !== undefined) studentUpdate.applicationFee = applicationFee;
    if (admissionFee !== undefined) studentUpdate.admissionFee = admissionFee;

    if (Object.keys(userUpdate).length > 0 && student.user) {
      await prisma.user.update({
        where: { id: student.user.id },
        data: userUpdate,
      });
    }

    if (Object.keys(studentUpdate).length > 0) {
      await prisma.student.update({
        where: { id },
        data: studentUpdate as Record<string, never>,
      });
    }

    const applicationUpdate: Record<string, unknown> = {};
    if (fatherName !== undefined) applicationUpdate.parentName = fatherName || null;
    if (occupation !== undefined) applicationUpdate.parentOccupation = occupation;
    if (email !== undefined) applicationUpdate.parentEmail = email || null;
    if (previousSchool !== undefined) applicationUpdate.previousSchoolName = previousSchool;
    if (officeAddress !== undefined) applicationUpdate.officeAddress = officeAddress;
    if (parentAadharNo !== undefined) applicationUpdate.parentAadharNo = parentAadharNo;
    if (parentWhatsapp !== undefined) applicationUpdate.parentWhatsapp = parentWhatsapp;
    if (bankAccountNo !== undefined) applicationUpdate.bankAccountNo = bankAccountNo;
    if (houseNo !== undefined) applicationUpdate.houseNo = houseNo;
    if (street !== undefined) applicationUpdate.street = street;
    if (city !== undefined) applicationUpdate.city = city;
    if (town !== undefined) applicationUpdate.town = town;
    if (state !== undefined) applicationUpdate.state = state;
    if (pinCode !== undefined) applicationUpdate.pinCode = pinCode;
    if (nationality !== undefined) applicationUpdate.nationality = nationality;
    if (languagesAtHome !== undefined) applicationUpdate.languagesAtHome = languagesAtHome;
    if (caste !== undefined) applicationUpdate.caste = caste;
    if (religion !== undefined) applicationUpdate.religion = religion;
    if (emergencyFatherNo !== undefined) applicationUpdate.emergencyFatherNo = emergencyFatherNo;
    if (emergencyMotherNo !== undefined) applicationUpdate.emergencyMotherNo = emergencyMotherNo;
    if (emergencyGuardianNo !== undefined) applicationUpdate.emergencyGuardianNo = emergencyGuardianNo;
    if (Object.keys(applicationUpdate).length > 0) {
      await prisma.studentApplication.updateMany({
        where: { studentId: id, schoolId },
        data: applicationUpdate as Record<string, never>,
      });
    }

    if (classId !== undefined || residencyType !== undefined) {
      const refreshed = await prisma.student.findFirst({
        where: { id, schoolId },
        include: { class: { select: { section: true } } },
      });
      if (refreshed) {
        const fee = await prisma.studentFee.findUnique({
          where: { studentId: id },
          select: { discountPercent: true, amountPaid: true },
        });
        await upsertStudentFeeFromStructure(prisma, {
          schoolId,
          studentId: id,
          classId: refreshed.classId,
          section: refreshed.class?.section ?? null,
          discountPercent: fee?.discountPercent ?? 0,
          amountPaid: fee?.amountPaid ?? 0,
        });
      }
    }

    return NextResponse.json({ message: "Student updated successfully" }, { status: 200 });
  } catch (error: unknown) {
    console.error("Student update error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteParams) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const id = resolved.id;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const hasFeature = session.user.role === "TEACHER" && (session.user.allowedFeatures?.includes("STUDENTS") || session.user.allowedFeatures?.includes("STUDENT_DETAILS"));
  if (!isAdmin && !hasFeature) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const schoolId = await resolveSchoolId(session);
  if (!schoolId) {
    return NextResponse.json({ message: "School not found" }, { status: 400 });
  }

  try {
    const student = await prisma.student.findFirst({
      where: { id, schoolId },
      select: { id: true, userId: true },
    });
    if (!student) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    await prisma.student.delete({ where: { id } });
    await prisma.user.delete({ where: { id: student.userId } });

    return NextResponse.json({ message: "Student deleted successfully" }, { status: 200 });
  } catch (error: unknown) {
    console.error("Student delete error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
