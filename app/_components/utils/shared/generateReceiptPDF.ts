import jsPDF from "jspdf";

type ReceiptPDFInput = {
    copyType?: string;
    schoolName?: string;
    student?: {
        user?: { name?: string | null } | null;
        admissionNumber?: string | null;
        class?: { displayName?: string | null } | null;
    } | null;
    payment?: {
        createdAt?: string | Date;
        transactionId?: string | null;
        gateway?: string | null;
        amount?: number | null;
    } | null;
};

export async function generateReceiptPDF(data: ReceiptPDFInput): Promise<ArrayBuffer> {
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
        [`Payment Date:`, new Date(data.payment?.createdAt as string | Date).toLocaleDateString("en-IN")],
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
