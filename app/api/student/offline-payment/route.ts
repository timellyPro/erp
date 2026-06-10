import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { isActiveStudent } from "@/lib/studentStatus";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
        if (!isAdmin) {
            return NextResponse.json({ message: "Only admin can record offline payments" }, { status: 403 });
        }

        let schoolId = session.user.schoolId;
        if (!schoolId) {
            const adminSchool = await prisma.school.findFirst({
                where: { admins: { some: { id: session.user.id } } },
                select: { id: true },
            });
            schoolId = adminSchool?.id ?? null;
        }

        if (!schoolId) {
            return NextResponse.json({ message: "School not found" }, { status: 400 });
        }

        const body = await req.json();
        const { studentId, amount, method, referenceNumber, bankName, description } = body;

        if (!studentId || typeof studentId !== "string") {
            return NextResponse.json({ message: "Student ID is required" }, { status: 400 });
        }

        if (!amount || typeof amount !== "number" || amount <= 0) {
            return NextResponse.json({ message: "Valid amount is required" }, { status: 400 });
        }

        if (!method || !["CASH", "CHEQUE", "BANK_TRANSFER", "DD"].includes(method)) {
            return NextResponse.json({ message: "Valid payment method is required" }, { status: 400 });
        }

        // Verify student exists and belongs to school
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, schoolId: true, status: true, fee: true },
        });

        if (!student) {
            return NextResponse.json({ message: "Student not found" }, { status: 404 });
        }

        if (!isActiveStudent(student.status)) {
            return NextResponse.json(
                { message: "Cannot record payments for inactive students" },
                { status: 400 }
            );
        }

        if (student.schoolId !== schoolId) {
            return NextResponse.json({ message: "Student does not belong to your school" }, { status: 403 });
        }

        // Verify amount doesn't exceed remaining fee
        if (student.fee && amount > student.fee.remainingFee) {
            return NextResponse.json(
                { message: `Amount exceeds remaining fee of ₹${student.fee.remainingFee.toLocaleString("en-IN")}` },
                { status: 400 }
            );
        }

        // Create transaction ID for offline payment
        const transactionId = `OFFLN${Date.now()}${Math.random().toString(36).substring(7).toUpperCase()}`;

        // Record the payment
        const payment = await prisma.payment.create({
            data: {
                studentId,
                amount,
                status: "COMPLETED",
                gateway: method,
                transactionId,
            },
        });

        // Update student fee record
        const updatedFee = await prisma.studentFee.update({
            where: { studentId },
            data: {
                amountPaid: {
                    increment: amount,
                },
                remainingFee: {
                    decrement: amount,
                },
            },
        });

        return NextResponse.json({
            success: true,
            message: "Offline payment recorded successfully",
            payment: {
                id: payment.id,
                amount: payment.amount,
                status: payment.status,
                method,
                transactionId,
                createdAt: payment.createdAt,
            },
            updatedFee: {
                amountPaid: updatedFee.amountPaid,
                remainingFee: updatedFee.remainingFee,
            },
        });
    } catch (error: unknown) {
        console.error("Error recording offline payment:", error);
        const message = error instanceof Error ? error.message : "Failed to record offline payment";
        return NextResponse.json({ message }, { status: 500 });
    }
}
