import { type RefObject } from "react";

/**
 * Utility to generate a PDF from a DOM element using html2canvas and jspdf.
 * We dynamically import them to avoid SSR issues and reduce initial bundle size.
 */
export async function generatePDF(
  elementRef: RefObject<HTMLElement | null>,
  filename: string
): Promise<void> {
  if (!elementRef.current) return;

  try {
    // Dynamic imports
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    // Capture the element
    const canvas = await html2canvas(elementRef.current, {
      scale: 2, // High resolution
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    // PDF dimensions setup (A4 standard: 210 x 297 mm)
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    // Calculate image height based on the aspect ratio of the canvas
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(filename);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF. Please try again.");
  }
}

/** Same visual capture as generatePDF; opens the browser print dialog (no PDF file). */
export async function printFromElement(elementRef: RefObject<HTMLElement | null>): Promise<void> {
  if (!elementRef.current) return;

  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(elementRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/png");
    const w = window.open("");
    if (!w) {
      throw new Error("Pop-up blocked. Allow pop-ups to print the receipt.");
    }
    w.document.open();
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print receipt</title></head><body style="margin:0;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;background:#fff"><img src="${imgData}" alt="" style="max-width:100%;height:auto" /></body></html>`
    );
    w.document.close();
    const img = w.document.querySelector("img");
    const runPrint = () => {
      w.focus();
      window.setTimeout(() => w.print(), 0);
    };
    if (img) {
      if (img.complete) runPrint();
      else img.addEventListener("load", runPrint, { once: true });
    } else {
      runPrint();
    }
  } catch (error) {
    console.error("Error printing receipt:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to open print preview. Please try again."
    );
  }
}
