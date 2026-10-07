import jsPDF from "jspdf";

export interface ReceiptData {
    schoolName: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    gradeSought?: string;
    boardingType?: string;
    residencyType?: string;
    parentName?: string;
    parentPhone?: string;
    totalFees: number;
    amountPaid: number;
    remainingFees: number;
    paymentDate: string;
    paymentMethod: string;
    transactionId: string;
    feeBreakdown?: Array<{
        feeType: string;
        amount: number;
    }>;
}

export async function generateReceiptPDF(data: any): Promise<ArrayBuffer> {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    const copyType = data.copyType || "admin";

    // Set default font
    doc.setFont("helvetica");

    // Header - Color coding by copy type
    const headerColor: [number, number, number] =
        copyType === "admin" ? [34, 197, 94] : [59, 130, 246]; // Green for Admin, Blue for Parent
    doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
    doc.rect(0, 0, pageWidth, 28, "F");

    // School Name in Header
    const schoolName = data.schoolName || "Timelly School";
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(schoolName, margin, 12);

    // Subtitle with Timelly branding
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Fee Receipt • Powered by Timelly", margin, 18);

    // Copy Type Badge
    const copyLabel = copyType === "admin" ? "ADMIN COPY" : "PARENT COPY";
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(copyLabel, pageWidth - margin - 40, 12);

    // FEE RECEIPT text
    doc.text("FEE RECEIPT", pageWidth - margin - 40, 20);

    // Reset text color
    doc.setTextColor(0, 0, 0);

    let yPosition = 40;

    // School Information Section
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("SCHOOL INFORMATION", margin + 2, yPosition + 4);

    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`School: ${data.schoolName || "Timely School"}`, margin + 2, yPosition);

    // Student Information Section
    yPosition += 12;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("STUDENT INFORMATION", margin + 2, yPosition + 4);

    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const studentInfo = [
        [`Student Name:`, data.student?.user?.name || "Student"],
        [`Admission Number:`, data.student?.admissionNumber || "N/A"],
        [`Class:`, data.student?.class?.displayName || "N/A"],
    ];

    studentInfo.forEach(([label, value]) => {
        doc.text(label, margin + 2, yPosition);
        doc.text(String(value), margin + 60, yPosition);
        yPosition += 7;
    });

    // Payment Information Section
    yPosition += 5;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT INFORMATION", margin + 2, yPosition + 4);

    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const paymentInfo = [
        [`Payment Date:`, new Date(data.payment?.createdAt).toLocaleDateString("en-IN")],
        [`Transaction ID:`, data.payment?.transactionId || "N/A"],
        [`Payment Method:`, data.payment?.gateway || "Online"],
    ];

    paymentInfo.forEach(([label, value]) => {
        doc.text(label, margin + 2, yPosition);
        doc.text(String(value), margin + 60, yPosition);
        yPosition += 7;
    });

    // Fees Summary Section
    yPosition += 8;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("FEES SUMMARY", margin + 2, yPosition + 4);

    yPosition += 15;

    // Summary details
    const summaryInfo = [
        [`Amount Paid:`, `₹${data.payment?.amount?.toLocaleString("en-IN") || "0"}`],
    ];

    summaryInfo.forEach(([label, value]) => {
        doc.setFont("helvetica", "normal");
        doc.text(label, margin + 2, yPosition);
        doc.text(String(value), pageWidth - margin - 30, yPosition, { align: "right" });
        yPosition += 7;
    });

    // Disclaimer/Footer
    yPosition = pageHeight - 30;

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);

    if (copyType === "admin") {
        doc.text(
            `This is an official record for school administration. Please retain for accounting purposes.`,
            pageWidth / 2,
            yPosition,
            { align: "center" }
        );
    } else {
        doc.text(
            `This is your official receipt for fees paid. Please keep it safely for future reference.`,
            pageWidth / 2,
            yPosition,
            { align: "center" }
        );
    }

    yPosition += 6;
    doc.text(
        `Generated on ${new Date().toLocaleDateString("en-IN")} • Powered by Timelly`,
        pageWidth / 2,
        yPosition,
        { align: "center" }
    );

    return doc.output("arraybuffer") as ArrayBuffer;
}

export const generateFeeReceipt = (data: ReceiptData) => {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // Set default font
    doc.setFont("helvetica");

    // Header - Timelly Branding
    doc.setFillColor(34, 197, 94); // Lime green
    doc.rect(0, 0, pageWidth, 25, "F");

    // School Name in Header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(data.schoolName, margin, 12);

    // Subtitle + Powered by Timelly
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Fee Receipt • Powered by Timelly", margin, 18);

    // Brand area on right (Timelly word-mark)
    doc.setTextColor(230, 255, 230);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Timelly", pageWidth - margin - 26, 15);

    // Reset text color
    doc.setTextColor(0, 0, 0);

    let yPosition = 35;

    // School Information Section
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("SCHOOL INFORMATION", margin + 2, yPosition + 4);

    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`School: ${data.schoolName}`, margin + 2, yPosition);

    // Student Information Section
    yPosition += 12;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("STUDENT INFORMATION", margin + 2, yPosition + 4);

    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const studentInfo = [
        [`Student Name:`, data.studentName],
        [`Application No:`, data.admissionNumber],
        [`Class:`, data.className],
        [`Grade:`, data.gradeSought || "-"],
        [`Boarding:`, data.boardingType || "-"],
        [`Residency:`, data.residencyType || "-"],
        [`Parent Name:`, data.parentName || "-"],
        [`Parent Phone:`, data.parentPhone || "-"],
    ];

    studentInfo.forEach(([label, value]) => {
        doc.text(label, margin + 2, yPosition);
        doc.text(String(value), margin + 60, yPosition);
        yPosition += 7;
    });

    // Payment Information Section
    yPosition += 5;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT INFORMATION", margin + 2, yPosition + 4);

    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const paymentInfo = [
        [`Receipt Date:`, new Date(data.paymentDate).toLocaleString("en-IN")],
        [`Transaction ID:`, data.transactionId],
        [`Payment Method:`, data.paymentMethod],
    ];

    paymentInfo.forEach(([label, value]) => {
        doc.text(label, margin + 2, yPosition);
        doc.text(String(value), margin + 60, yPosition);
        yPosition += 7;
    });

    // Fees Breakdown Section
    yPosition += 8;

    if (data.feeBreakdown && data.feeBreakdown.length > 0) {
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPosition - 3, contentWidth, 12, "F");

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("FEES BREAKDOWN", margin + 2, yPosition + 4);

        yPosition += 15;

        // Table headers
        doc.setFillColor(34, 197, 94); // Lime green header
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);

        doc.rect(margin, yPosition - 6, contentWidth * 0.5, 8, "F");
        doc.rect(margin + contentWidth * 0.5, yPosition - 6, contentWidth * 0.5, 8, "F");

        doc.text("Fee Type", margin + 3, yPosition);
        doc.text("Amount", margin + contentWidth * 0.5 + 3, yPosition, { align: "left" });

        yPosition += 10;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        // Table rows
        data.feeBreakdown.forEach((item, index) => {
            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(margin, yPosition - 6, contentWidth, 8, "F");
            }

            doc.text(item.feeType, margin + 3, yPosition);
            doc.text(`₹${item.amount.toLocaleString("en-IN")}`, pageWidth - margin - 3, yPosition, {
                align: "right",
            });

            yPosition += 8;
        });
        doc.setFontSize(10);
        const summaryInfo = [
            [`Total Fees:`, `₹${data.totalFees.toLocaleString("en-IN")}`],
            [`Amount Paid:`, `₹${data.amountPaid.toLocaleString("en-IN")}`],
        ];

        summaryInfo.forEach(([label, value]) => {
            doc.setFont("helvetica", "normal");
            doc.text(label, margin + 2, yPosition);
            doc.text(String(value), pageWidth - margin - 30, yPosition, { align: "right" });
            yPosition += 7;
        });

        // Remaining Amount (highlighted)
        yPosition += 3;
        doc.setFillColor(254, 243, 199); // Light yellow
        doc.rect(margin, yPosition - 5, contentWidth, 10, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Remaining Fees:", margin + 2, yPosition + 2);
        doc.setTextColor(220, 38, 38); // Red for remaining
        doc.text(
            `₹${data.remainingFees.toLocaleString("en-IN")}`,
            pageWidth - margin - 30,
            yPosition + 2,
            { align: "right" }
        );

        // Footer
        yPosition = pageHeight - 20;

        doc.setTextColor(100, 100, 100);
        doc.setFontSize(8);
        doc.text(
            `Generated on ${new Date().toLocaleDateString("en-IN")} • Powered by Timelly • Confidential`,
            pageWidth / 2,
            yPosition,
            { align: "center" }
        );

        // Page number
        doc.setFontSize(8);
        doc.text(
            `Page 1`,
            pageWidth / 2,
            yPosition + 5,
            { align: "center" }
        );

        // Generate filename
        const filename = `Receipt_${data.admissionNumber}_${new Date().toISOString().split("T")[0]}.pdf`;

        // Download the PDF
        doc.save(filename);
    }
};
