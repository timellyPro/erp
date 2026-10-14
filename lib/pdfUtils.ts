import { type RefObject } from "react";

type Html2CanvasFn = (
  element: HTMLElement,
  options?: Record<string, unknown>
) => Promise<HTMLCanvasElement>;

type StyleSnapshot = {
  el: HTMLElement;
  visibility: string;
  opacity: string;
  position: string;
  left: string;
  top: string;
  zIndex: string;
  pointerEvents: string;
};

function revealCaptureTree(element: HTMLElement): StyleSnapshot[] {
  const snapshots: StyleSnapshot[] = [];
  let node: HTMLElement | null = element;
  while (node) {
    snapshots.push({
      el: node,
      visibility: node.style.visibility,
      opacity: node.style.opacity,
      position: node.style.position,
      left: node.style.left,
      top: node.style.top,
      zIndex: node.style.zIndex,
      pointerEvents: node.style.pointerEvents,
    });
    node.style.visibility = "visible";
    node.style.opacity = "1";
    node.style.pointerEvents = "none";
    if (getComputedStyle(node).position === "fixed") {
      node.style.position = "absolute";
      node.style.left = "0";
      node.style.top = "0";
      node.style.zIndex = "9999";
    }
    node = node.parentElement;
  }
  return snapshots;
}

function restoreCaptureTree(snapshots: StyleSnapshot[]) {
  for (const snap of snapshots) {
    snap.el.style.visibility = snap.visibility;
    snap.el.style.opacity = snap.opacity;
    snap.el.style.position = snap.position;
    snap.el.style.left = snap.left;
    snap.el.style.top = snap.top;
    snap.el.style.zIndex = snap.zIndex;
    snap.el.style.pointerEvents = snap.pointerEvents;
  }
}

/** html2canvas also clones into an iframe — unhide that tree too. */
function unhideCloneForCapture(clonedRoot: HTMLElement) {
  const view = clonedRoot.ownerDocument.defaultView;
  let node: HTMLElement | null = clonedRoot;
  while (node) {
    node.style.visibility = "visible";
    node.style.opacity = "1";
    node.style.pointerEvents = "none";
    const position = view ? view.getComputedStyle(node).position : node.style.position;
    if (position === "fixed") {
      node.style.position = "absolute";
      node.style.left = "0";
      node.style.top = "0";
      node.style.zIndex = "1";
    }
    node = node.parentElement;
  }
}

/** Wait until a hidden PDF mount has rendered (fonts, images, layout). */
export async function waitForPdfMountReady(
  elementRef: RefObject<HTMLElement | null>,
  minHeight = 400,
  maxMs = 8000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (elementRef.current && elementRef.current.offsetHeight >= minHeight) break;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  if (!elementRef.current || elementRef.current.offsetHeight < minHeight) {
    throw new Error("Receipt template failed to render. Please try again.");
  }
  const imgs = elementRef.current.querySelectorAll("img");
  await Promise.all(
    Array.from(imgs).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }
        })
    )
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function captureElementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas-pro")).default as Html2CanvasFn;
  const snapshots = revealCaptureTree(element);
  try {
    return await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        unhideCloneForCapture(clonedEl);
      },
    });
  } finally {
    restoreCaptureTree(snapshots);
  }
}

/**
 * Utility to generate a PDF from a DOM element using html2canvas and jspdf.
 * We dynamically import them to avoid SSR issues and reduce initial bundle size.
 */
export async function generatePDF(
  elementRef: RefObject<HTMLElement | null>,
  filename: string
): Promise<void> {
  if (!elementRef.current) {
    throw new Error("PDF template is not ready. Please try again.");
  }

  try {
    const { jsPDF } = await import("jspdf");
    const canvas = await captureElementToCanvas(elementRef.current);

    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error("PDF capture produced empty content.");
    }

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
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      detail.includes("oklch") || detail.includes("unsupported color")
        ? "PDF export failed due to a styling issue. Please refresh and try again."
        : "Failed to generate PDF. Please try again."
    );
  }
}

/** Print via a hidden iframe so browsers do not treat it as a pop-up. */
function printImageDataUrl(imgData: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Print receipt");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 1000);
    };

    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      fail("Failed to open print preview. Please try again.");
      return;
    }

    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print receipt</title>
<style>@page{margin:10mm}html,body{margin:0;padding:0;background:#fff}
body{display:flex;justify-content:center;align-items:flex-start;min-height:100vh}
img{max-width:100%;height:auto;display:block}</style></head>
<body><img src="${imgData}" alt="Receipt" /></body></html>`
    );
    doc.close();

    const img = doc.querySelector("img");
    const runPrint = () => {
      try {
        win.focus();
        win.print();
        cleanup();
        resolve();
      } catch {
        fail("Failed to open print dialog. Please try again.");
      }
    };

    if (img) {
      if (img.complete) {
        window.setTimeout(runPrint, 0);
      } else {
        img.addEventListener("load", () => window.setTimeout(runPrint, 0), { once: true });
        img.addEventListener(
          "error",
          () => fail("Receipt image failed to load for printing."),
          { once: true }
        );
      }
    } else {
      window.setTimeout(runPrint, 0);
    }
  });
}

/** Same visual capture as generatePDF; opens the browser print dialog (no PDF file). */
export async function printFromElement(
  elementRef: RefObject<HTMLElement | null>,
  opts?: { minHeight?: number }
): Promise<void> {
  await waitForPdfMountReady(elementRef, opts?.minHeight ?? 400);

  try {
    const canvas = await captureElementToCanvas(elementRef.current!);
    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error("PDF capture produced empty content.");
    }
    await printImageDataUrl(canvas.toDataURL("image/png"));
  } catch (error) {
    console.error("Error printing receipt:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to open print preview. Please try again."
    );
  }
}
