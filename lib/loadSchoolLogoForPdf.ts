import { resolveSchoolLogoFetchUrl } from "@/lib/feeDayReportExcel";

export type SchoolLogoSource = {
  logoUrl?: string | null;
  admins?: Array<{ photoUrl?: string | null }> | null;
};

const DEFAULT_LOGO = "/timelylogo.webp";

export function pickSchoolLogoUrl(school?: SchoolLogoSource | null): string {
  const logo = school?.logoUrl?.trim();
  if (logo) return logo;
  const adminPhoto = school?.admins?.[0]?.photoUrl?.trim();
  if (adminPhoto) return adminPhoto;
  return DEFAULT_LOGO;
}

function absoluteFetchUrl(url: string): string {
  const viaMedia = resolveSchoolLogoFetchUrl(url);
  const resolved = viaMedia || url;
  if (resolved.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${resolved}`;
  }
  return resolved;
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(absoluteFetchUrl(url), {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** jsPDF reliably supports PNG/JPEG — convert WebP and others via canvas. */
async function toPdfSafePng(dataUrl: string): Promise<string | null> {
  if (dataUrl.startsWith("data:image/png")) return dataUrl;
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    return rasterizeToPng(dataUrl);
  }
  return rasterizeToPng(dataUrl);
}

function rasterizeToPng(src: string): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = Math.max(1, img.naturalWidth || 200);
        const h = Math.max(1, img.naturalHeight || 200);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Faint PNG watermark (alpha baked in) for page center. */
export async function buildLogoWatermarkPng(
  logoPng: string,
  opacity = 0.1,
  sizePx = 480
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.clearRect(0, 0, sizePx, sizePx);
        ctx.globalAlpha = opacity;
        const scale = Math.min(sizePx / img.width, sizePx / img.height) * 0.85;
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (sizePx - w) / 2, (sizePx - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = logoPng;
  });
}

export async function loadSchoolLogoForPdf(
  school?: SchoolLogoSource | null
): Promise<{ png: string; watermarkPng: string | null } | null> {
  const primary = pickSchoolLogoUrl(school);
  const candidates = [primary];
  if (primary !== DEFAULT_LOGO) candidates.push(DEFAULT_LOGO);

  for (const url of candidates) {
    const raw = await fetchAsDataUrl(url);
    if (!raw) continue;
    const png = await toPdfSafePng(raw);
    if (!png) continue;
    const watermarkPng = await buildLogoWatermarkPng(png, 0.11, 520);
    return { png, watermarkPng };
  }
  return null;
}
