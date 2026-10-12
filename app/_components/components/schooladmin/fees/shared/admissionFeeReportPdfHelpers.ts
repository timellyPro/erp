export type PdfAlign = "left" | "center" | "right";
export type Rgb = [number, number, number];

export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function formatInrPdf(amount: number): string {
  return `₹ ${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatPaymentModePdf(mode: string | null): string {
  const m = String(mode ?? "").trim().toUpperCase();
  if (m === "ONLINE") return "Online";
  if (m === "OFFLINE") return "Offline";
  return m ? m.charAt(0) + m.slice(1).toLowerCase() : "—";
}

/** Short label for PDF cells (UPI ref details go on second line if needed). */
export function formatPaymentMethodPdf(method: string | null): { primary: string; detail?: string } {
  const raw = String(method ?? "").trim();
  if (!raw) return { primary: "—" };
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  const head = (parts[0] ?? "").toUpperCase();
  let primary = head.replace(/_/g, " ");
  if (primary === "BANK TRANSFER") primary = "Bank transfer";
  if (primary === "CASH") primary = "Cash";
  if (primary === "UPI") primary = "UPI";
  const refPart = parts.find((p) => p.toUpperCase().startsWith("REF:"));
  if (refPart) {
    return { primary, detail: refPart.replace(/^REF:\s*/i, "Ref: ") };
  }
  return { primary };
}

export function columnWidths(total: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor(((total * r) / sum) * 10) / 10);
  const used = widths.slice(0, -1).reduce((a, b) => a + b, 0);
  widths[widths.length - 1] = Math.round((total - used) * 10) / 10;
  return widths;
}
