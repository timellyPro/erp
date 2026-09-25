import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { supabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";

export type PdfLogoAsset = {
  data: string;
  format: "PNG" | "JPEG";
};

function toDataUri(logo: PdfLogoAsset): string {
  if (logo.data.startsWith("data:")) return logo.data;
  const mime = logo.format === "JPEG" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${logo.data}`;
}

function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "storage");
    if (idx < 0) return null;
    if (parts[idx + 1] !== "v1" || parts[idx + 2] !== "object") return null;
    const maybePublic = parts[idx + 3] === "public";
    const bucket = parts[idx + (maybePublic ? 4 : 3)] ?? "";
    const pathParts = parts.slice(idx + (maybePublic ? 5 : 4));
    const objectPath = pathParts.join("/");
    if (!bucket || !objectPath) return null;
    return { bucket, path: objectPath };
  } catch {
    return null;
  }
}

async function toPdfSafePng(buffer: Buffer): Promise<PdfLogoAsset | null> {
  try {
    const png = await sharp(buffer).png().toBuffer();
    return { data: png.toString("base64"), format: "PNG" };
  } catch {
    return null;
  }
}

async function downloadSupabaseLogo(logoUrl: string): Promise<PdfLogoAsset | null> {
  if (!supabaseAdmin) return null;
  const parsed = parseSupabaseStorageUrl(logoUrl);
  if (!parsed) return null;
  const buckets = [...new Set([parsed.bucket, SUPABASE_BUCKET].filter(Boolean))];
  for (const bucket of buckets) {
    try {
      const { data, error } = await supabaseAdmin.storage.from(bucket).download(parsed.path);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      const asset = await toPdfSafePng(buf);
      if (asset) return asset;
    } catch {
      /* try next bucket */
    }
  }
  return null;
}

function absUrl(raw: string, origin: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${origin}${raw}`;
  return `${origin}/${raw.replace(/^\//, "")}`;
}

async function fetchRemoteLogo(url: string): Promise<PdfLogoAsset | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      return { data: buf.toString("base64"), format: "JPEG" };
    }
    if (contentType.includes("png")) {
      return { data: buf.toString("base64"), format: "PNG" };
    }
    return toPdfSafePng(buf);
  } catch {
    return null;
  }
}

async function readLocalLogo(filename: string): Promise<PdfLogoAsset | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", filename));
    return toPdfSafePng(buf);
  } catch {
    return null;
  }
}

/** Export for jsPDF addImage — must be a data URI, not raw base64. */
export function pdfLogoDataUri(logo: PdfLogoAsset): string {
  return toDataUri(logo);
}

async function loadSingleLogo(trimmed: string, origin: string): Promise<PdfLogoAsset | null> {
  if (trimmed.includes("/storage/v1/object/")) {
    const fromStorage = await downloadSupabaseLogo(trimmed);
    if (fromStorage) return fromStorage;
  }

  const mediaUrl = trimmed.includes("/storage/v1/object/")
    ? absUrl(`/api/media?url=${encodeURIComponent(trimmed)}`, origin)
    : trimmed.startsWith("http")
      ? trimmed
      : absUrl(trimmed, origin);

  return fetchRemoteLogo(mediaUrl);
}

/** School logo for PDF — uses school logoUrl (WebP/JPEG/PNG via sharp). No Timelly fallback here. */
export async function loadLogoForServerPdf(
  logoUrl: string | null | undefined,
  origin: string,
  fallbackLogoUrl?: string | null
): Promise<PdfLogoAsset | null> {
  const candidates = [logoUrl?.trim(), fallbackLogoUrl?.trim()].filter(Boolean) as string[];
  for (const url of candidates) {
    const asset = await loadSingleLogo(url, origin);
    if (asset) return asset;
  }
  return null;
}

/** Timelly fallback only when the school has no logo configured. */
export async function loadTimellyFallbackLogo(): Promise<PdfLogoAsset | null> {
  return (
    (await readLocalLogo("whitetimellylogo.png")) ??
    (await readLocalLogo("icon.png"))
  );
}
