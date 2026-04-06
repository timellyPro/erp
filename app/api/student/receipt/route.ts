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
        const studentName = searchParams.get("studentName") || "Student";
        const admissionNumber = searchParams.get("admissionNumber") || "";
        const copyType = (searchParams.get("copyType") || "admin") as "admin" | "parent";

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
                school: { select: { name: true } },
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
            select: { name: true },
        });

        const schoolName = school?.name ?? student.school?.name ?? "Timelly School";

        const pdfBytes = await generateReceiptPDFServer({
            payment,
            student,
            copyType,
            schoolName,
        });

        return new NextResponse(pdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="Receipt_${admissionNumber}_${copyType}_${new Date(payment.createdAt).toISOString().split("T")[0]}.pdf"`,
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
