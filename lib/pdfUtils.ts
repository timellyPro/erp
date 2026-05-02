import type { RefObject } from "react";

/** Unlock cloned DOM for html2canvas (display:none / opacity-0 / off-screen break capture). */
function prepareCloneForCanvas(clonedRoot: HTMLElement) {
  let node: HTMLElement | null = clonedRoot;
  let depth = 0;
  const max = 24;
  while (node && depth < max) {
    node.classList.remove("hidden");
    node.style.setProperty("display", "block", "important");
    node.style.setProperty("visibility", "visible", "important");
    node.style.setProperty("opacity", "1", "important");
    node.style.setProperty("pointer-events", "auto", "important");
    node.style.removeProperty("clip-path");
    node = node.parentElement;
    depth += 1;
  }
  clonedRoot.style.setProperty("position", "fixed", "important");
  clonedRoot.style.setProperty("left", "0", "important");
  clonedRoot.style.setProperty("top", "0", "important");
  clonedRoot.style.setProperty("z-index", "2147483646", "important");
}

async function waitForRef(ref: RefObject<HTMLElement | null>, timeoutMs = 4000): Promise<HTMLElement> {
  const start = Date.now();
  while (!ref.current && Date.now() - start < timeoutMs) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
  if (!ref.current) {
    throw new Error("Nothing to export — the template did not mount. Try again.");
  }
  return ref.current;
}

/**
 * Generate a PDF from a DOM element using html2canvas and jsPDF.
 * Works with off-screen / `hidden` / `opacity-0` wrappers via `onclone` fixes.
 */
export async function generatePDF(
  elementRef: RefObject<HTMLElement | null>,
  filename: string
): Promise<void> {
  const el = await waitForRef(elementRef);

  const html2canvas = (await import("html2canvas-pro")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    onclone: (_clonedDoc: Document, cloned: HTMLElement) => {
      prepareCloneForCanvas(cloned);
    },
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfPageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let y = 0;
  pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
  heightLeft -= pdfPageHeight;

  while (heightLeft > 0.5) {
    y -= pdfPageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
    heightLeft -= pdfPageHeight;
  }

  pdf.save(filename);
}

/** Same visual capture as generatePDF; opens the browser print dialog (no PDF file). */
export async function printFromElement(elementRef: RefObject<HTMLElement | null>): Promise<void> {
  const el = await waitForRef(elementRef);

  const html2canvas = (await import("html2canvas-pro")).default;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    onclone: (_clonedDoc: Document, cloned: HTMLElement) => {
      prepareCloneForCanvas(cloned);
    },
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
}
