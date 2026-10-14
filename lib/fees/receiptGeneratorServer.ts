import jsPDF from "jspdf";

type FeeReceiptCopy = "admin" | "parent";

/** Input for server-side fee receipt PDF (student receipt API + Prisma-loaded entities). */
export type FeeReceiptGeneratorInput = {
    copyType?: string;
    schoolName?: string;
    schoolAddress?: string;
    schoolLocation?: string;
    className?: string;
    sectionName?: string;
    generatedAt?: string;
    student?: { user?: { name?: string | null } | null; rollNo?: string | null } | null;
    timellyId?: string;
    admissionYear?: string;
    displayAdmissionNumber?: string;
    payment?: {
        createdAt?: string | Date;
        transactionId?: string | null;
        method?: string | null;
        feeTypeName?: string | null;
        amount?: number | string | null;
    } | null;
    feeBreakdown?: Array<{ feeType?: string; amount?: number }>;
    totalFees?: number;
    remainingFees?: number;
};

type FeeReceiptLayout = {
    pageWidth: number;
    pageHeight: number;
    margin: number;
    contentWidth: number;
    schoolName: string;
    schoolAddress: string;
    schoolLocation: string;
    classInfo: string;
    generatedAt: string;
    studentName: string;
    timellyId: string;
    admissionYear: string;
    admissionNumber: string;
    paymentDate: string;
    transactionId: string;
    paymentMethod: string;
    feeTypeName: string;
    amountPaidThis: number;
    totalFees: number;
    remainingFees: number;
    breakdown: Array<{ feeType: string; amount: number }>;
};

function buildReceiptLayout(data: FeeReceiptGeneratorInput): FeeReceiptLayout {
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    const schoolName = data.schoolName || "Timelly School";
    const schoolAddress = data.schoolAddress || "-";
    const schoolLocation = data.schoolLocation || "-";
    const classInfo = data.className
        ? `${data.className}${data.sectionName ? ` - ${data.sectionName}` : ""}`
        : "N/A";
    const generatedAt = new Date(data.generatedAt || new Date()).toLocaleString("en-IN");

    const studentName = data.student?.user?.name || "Student";
    const timellyId = data.timellyId || data.student?.rollNo || "N/A";
    const admissionYear = data.admissionYear || "N/A";
    const admissionNumber = data.displayAdmissionNumber || `ADM/${admissionYear}/${timellyId}`;

    const paymentDate = new Date(data.payment?.createdAt || new Date()).toLocaleDateString("en-IN");
    const transactionId = data.payment?.transactionId || "N/A";
    const paymentMethod = data.payment?.method || "Online";
    const feeTypeName = data.payment?.feeTypeName || "Fee payment";
    const amountPaidThis = Number(data.payment?.amount || 0);
    const totalFees = Number(data.totalFees || 0);
    const remainingFees = Number(data.remainingFees || 0);
    const breakdown: Array<{ feeType: string; amount: number }> = Array.isArray(data.feeBreakdown)
        ? data.feeBreakdown.map((item) => ({
              feeType: item?.feeType ?? "Fee",
              amount: Number(item?.amount ?? 0),
          }))
        : [];

    return {
        pageWidth,
        pageHeight,
        margin,
        contentWidth,
        schoolName,
        schoolAddress,
        schoolLocation,
        classInfo,
        generatedAt,
        studentName,
        timellyId,
        admissionYear,
        admissionNumber,
        paymentDate,
        transactionId,
        paymentMethod,
        feeTypeName,
        amountPaidThis,
        totalFees,
        remainingFees,
        breakdown,
    };
}

function appendFeeReceiptPage(doc: jsPDF, copyType: FeeReceiptCopy, L: FeeReceiptLayout): void {
    const { pageWidth, pageHeight, margin, contentWidth } = L;

    doc.setFont("helvetica");
    const headerColor = copyType === "admin" ? [34, 197, 94] : [59, 130, 246];
    doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
    doc.rect(0, 0, pageWidth, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(L.schoolName, margin, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Fee Receipt • Powered by Timelly", margin, 18);
    doc.setFont("helvetica", "bold");
    doc.text(copyType === "admin" ? "ADMIN COPY" : "PARENT COPY", pageWidth - margin - 40, 12);
    doc.text("FEE RECEIPT", pageWidth - margin - 40, 20);
    doc.setTextColor(0, 0, 0);

    let y = 40;
    const sectionHeader = (title: string) => {
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y - 3, contentWidth, 12, "F");
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(title, margin + 2, y + 4);
        y += 15;
    };
    const keyValue = (label: string, value: string) => {
        const keyX = margin + 2;
        const valX = margin + 60;
        const valWidth = contentWidth - 62;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(label, keyX, y);
        const wrapped = doc.splitTextToSize(String(value || "-"), valWidth);
        doc.text(wrapped, valX, y);
        y += Math.max(7, wrapped.length * 5);
    };

    sectionHeader("SCHOOL INFORMATION");
    keyValue("School:", L.schoolName);
    keyValue("Address:", L.schoolAddress);
    keyValue("Location:", L.schoolLocation);
    keyValue("Class & Section:", L.classInfo);
    keyValue("Date & Time:", L.generatedAt);

    y += 5;
    sectionHeader("STUDENT INFORMATION");
    keyValue("Student Name:", L.studentName);
    keyValue("Admission #:", L.admissionNumber);
    keyValue("Timelly ID / Year:", `${L.timellyId} / ${L.admissionYear}`);

    y += 5;
    sectionHeader("PAYMENT INFORMATION");
    keyValue("Payment Date:", L.paymentDate);
    keyValue("Transaction ID:", L.transactionId);
    keyValue("Payment Method:", L.paymentMethod);
    keyValue("Fee Type:", L.feeTypeName);

    if (L.breakdown.length > 0) {
        y += 3;
        sectionHeader("PAID COMPONENTS");
        for (const item of L.breakdown.slice(0, 10)) {
            const feeType = item.feeType || "Fee Component";
            const amount = `₹${Number(item.amount || 0).toLocaleString("en-IN")}`;
            const labelLines = doc.splitTextToSize(feeType, contentWidth - 40);
            doc.text(labelLines, margin + 2, y);
            doc.text(amount, pageWidth - margin - 2, y, { align: "right" });
            y += Math.max(7, labelLines.length * 5);
        }
    }

    y += 4;
    sectionHeader("FEES SUMMARY");
    doc.setTextColor(22, 163, 74);
    keyValue("Amount Paid (This Receipt):", `₹${L.amountPaidThis.toLocaleString("en-IN")}`);
    doc.setTextColor(0, 0, 0);
    keyValue("Total Fees:", `₹${L.totalFees.toLocaleString("en-IN")}`);
    doc.setTextColor(220, 38, 38);
    keyValue("Remaining Due:", `₹${L.remainingFees.toLocaleString("en-IN")}`);
    doc.setTextColor(100, 100, 100);

    const footerY = pageHeight - 20;
    doc.setFontSize(8);
    const footerLine =
        copyType === "admin"
            ? "This is an official record for school administration. Please retain for accounting purposes."
            : "This is your official receipt for fees paid. Please keep it safely for future reference.";
    doc.text(footerLine, pageWidth / 2, footerY - 3, { align: "center" });
    doc.text(`Generated on ${new Date().toLocaleDateString("en-IN")} • Powered by Timelly`, pageWidth / 2, footerY + 3, {
        align: "center",
    });
}

export async function generateReceiptPDFServer(data: FeeReceiptGeneratorInput): Promise<ArrayBuffer> {
    const raw = (data.copyType || "admin") as string;
    const copies: FeeReceiptCopy[] =
        raw === "both" ? ["admin", "parent"] : raw === "parent" ? ["parent"] : ["admin"];

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const layout = buildReceiptLayout(data);

    copies.forEach((copyType, index) => {
        if (index > 0) {
            doc.addPage();
        }
        appendFeeReceiptPage(doc, copyType, layout);
    });

    return doc.output("arraybuffer") as ArrayBuffer;
}
