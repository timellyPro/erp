import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { generateReceiptPDFServer } from "@/lib/receiptGeneratorServer";

async function resolveSchoolId(session: { user: { id: string; schoolId?: string | null; role?: string } }) {
    let schoolId = session.user.schoolId;
    if (!schoolId && (session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN")) {
        const adminSchool = await prisma.school.findFirst({
            where: { admins: { some: { id: session.user.id } } },
            select: { id: true },
        });
        schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId && session.user.role === "TEACHER") {
        const teacherClass = await prisma.class.findFirst({
            where: { teacherId: session.user.id },
            select: { schoolId: true },
        });
        schoolId = teacherClass?.schoolId ?? null;
    }
    if (!schoolId && session.user.role === "TEACHER") {
        const teacherSchool = await prisma.school.findFirst({
            where: { teachers: { some: { id: session.user.id } } },
            select: { id: true },
        });
        schoolId = teacherSchool?.id ?? null;
    }
    return schoolId;
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const schoolId = await resolveSchoolId(session);
        if (!schoolId) {
            return NextResponse.json({ error: "School not found" }, { status: 400 });
        }

        const searchParams = request.nextUrl.searchParams;
        const paymentId = searchParams.get("paymentId");
        const studentId = searchParams.get("studentId");
        const _studentName = searchParams.get("studentName") || "Student";
        const admissionNumber = searchParams.get("admissionNumber") || "";
        const copyParam = (searchParams.get("copyType") || "admin").toLowerCase();
        const copyType = (
            copyParam === "parent" ? "parent" : copyParam === "both" ? "both" : "admin"
        ) as "admin" | "parent" | "both";

        if (!paymentId || !studentId) {
            return NextResponse.json(
                { error: "Missing required parameters" },
                { status: 400 }
            );
        }

        // Verify student belongs to school
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId },
            include: {
                user: true,
                class: true,
                school: { select: { name: true, address: true, location: true } },
                fee: true,
            },
        });

        if (!student) {
            return NextResponse.json({ error: "Student not found" }, { status: 404 });
        }

        let payment: any = null;

        if (paymentId === "admission-fee") {
            payment = {
                id: "admission-fee",
                studentId: studentId,
                amount: student.admissionFee || 0,
                status: "completed",
                gateway: "One-time",
                method: "One-time",
                transactionId: "N/A",
                createdAt: student.createdAt || new Date(),
                feeTypeName: "Admission Fee"
            };
        } else if (paymentId === "application-fee") {
            payment = {
                id: "application-fee",
                studentId: studentId,
                amount: student.applicationFee || 0,
                status: "completed",
                gateway: "One-time",
                method: "One-time",
                transactionId: "N/A",
                createdAt: student.createdAt || new Date(),
                feeTypeName: "Application Fee"
            };
        } else {
            const dbPayment = await prisma.payment.findFirst({
                where: {
                    id: paymentId,
                    studentId: studentId,
                },
            });
            if (dbPayment) payment = dbPayment;
        }

        if (!payment) {
            return NextResponse.json({ error: "Payment not found" }, { status: 404 });
        }

        const school = await prisma.school.findUnique({
            where: { id: schoolId },
            select: { name: true, address: true, location: true },
        });

        const schoolName = school?.name ?? student.school?.name ?? "Timelly School";
        const schoolAddress = school?.address ?? student.school?.address ?? "";
        const schoolLocation = school?.location ?? student.school?.location ?? "";
        const linkedApplication = await prisma.studentApplication.findFirst({
            where: { studentId: student.id },
            select: { rollNo: true },
        });

        const paymentAllocations =
            paymentId === "admission-fee" || paymentId === "application-fee"
                ? []
                : await prisma.paymentFeeAllocation.findMany({
                      where: { paymentId, allocationType: "PAYMENT" },
                      select: {
                          headType: true,
                          componentIndex: true,
                          componentName: true,
                          extraFeeId: true,
                          allocatedAmount: true,
                      },
                  });

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
        const extraNameById = new Map(extraFees.map((e) => [e.id, e.name]));

        const feeBreakdown =
            paymentAllocations.length > 0
                ? paymentAllocations.map((a) => ({
                      feeType:
                          a.headType === "BASE_COMPONENT"
                              ? a.componentName || (a.componentIndex === -1 ? "Tuition Fee" : "Fee Component")
                              : extraNameById.get(a.extraFeeId || "") || "Extra Fee",
                      amount: a.allocatedAmount,
                  }))
                : [
                      {
                          feeType: payment.feeTypeName || "Fee Payment",
                          amount: Number(payment.amount) || 0,
                      },
                  ];

        const admissionParts = (student.admissionNumber || "").split("/");
        const admissionPrefix = admissionParts[0] || "ADM";
        const admissionYear = admissionParts.length >= 2 ? admissionParts[1] : String(new Date().getFullYear());
        const timellyId =
            (student.rollNo && String(student.rollNo).trim()) ||
            (linkedApplication?.rollNo && String(linkedApplication.rollNo).trim()) ||
            (admissionParts[admissionParts.length - 1] || "").trim();
        const displayAdmissionNumber = `${admissionPrefix}/${admissionYear}/${timellyId || "N/A"}`;

        const pdfBytes = await generateReceiptPDFServer({
            payment,
            student,
            copyType,
            schoolName,
            schoolAddress,
            schoolLocation,
            className: student.class?.name ?? "",
            sectionName: student.class?.section ?? "",
            generatedAt: new Date().toISOString(),
            feeBreakdown,
            totalFees: (student.fee?.amountPaid || 0) + (student.fee?.remainingFee || 0),
            remainingFees: student.fee?.remainingFee || 0,
            timellyId,
            admissionYear,
            displayAdmissionNumber,
        });

        const copySuffix =
            copyType === "both" ? "Admin_and_Parent" : copyType === "parent" ? "Parent" : "Admin";
        return new NextResponse(pdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="Receipt_${admissionNumber}_${copySuffix}_${new Date(payment.createdAt).toISOString().split("T")[0]}.pdf"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Receipt generation error:", error);
        return NextResponse.json(
            { error: "Failed to generate receipt" },
            { status: 500 }
        );
    }
}
