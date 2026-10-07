import type { RefObject } from "react";
import { resolveSchoolBrand, type SchoolBrand } from "@/lib/resolveSchoolBrand";

async function waitForPdfElement(
  ref: RefObject<HTMLElement | null>,
  maxMs = 8000,
  minHeight = 80
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (ref.current && ref.current.offsetHeight >= minHeight) break;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  if (!ref.current || ref.current.offsetHeight < minHeight) {
    throw new Error("PDF template failed to render. Please try again.");
  }
  // Let fonts, tables, and logo images finish layout
  const imgs = ref.current.querySelectorAll("img");
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
  await new Promise((resolve) => setTimeout(resolve, 200));
}

export async function downloadParentPortalPdf(opts: {
  ref: RefObject<HTMLElement | null>;
  filename: string;
  minHeight?: number;
  beforeCapture?: (brand: SchoolBrand) => void | Promise<void>;
}): Promise<void> {
  const minHeight = opts.minHeight ?? 80;
  await waitForPdfElement(opts.ref, 3000, 1);

  const brand = await resolveSchoolBrand();
  if (opts.beforeCapture) {
    await opts.beforeCapture(brand);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await waitForPdfElement(opts.ref, 8000, minHeight);
  const { generatePDF } = await import("@/lib/pdfUtils");
  await generatePDF(opts.ref, opts.filename);
}
