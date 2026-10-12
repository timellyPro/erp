import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { supabaseAdmin, SUPABASE_BUCKET } from "@/lib/supabase";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const MAX_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function isTransientUploadError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("econnreset") ||
    m.includes("enotfound")
  );
}

async function saveLocally(file: File, folder: string, safeName: string) {
  const localFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+/, "");
  const relPath = path.posix.join("uploads", localFolder || "images", `${Date.now()}-${safeName}`);
  const absPath = path.join(process.cwd(), "public", ...relPath.split("/"));
  await mkdir(path.dirname(absPath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, buffer);
  return { url: `/${relPath}`, path: relPath };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const isDev = process.env.NODE_ENV !== "production";
    const schoolId = (session.user as { schoolId?: string | null })?.schoolId ?? null;

    if (!supabaseAdmin && !isDev) {
      return NextResponse.json(
        { message: "Upload not configured on server. Missing Supabase credentials." },
        { status: 503 }
      );
    }

    if (supabaseAdmin) {
      const { data: bucketInfo, error: bucketError } = await supabaseAdmin.storage.getBucket(
        SUPABASE_BUCKET
      );
      if (bucketError || !bucketInfo) {
        logger.error("Supabase bucket check failed:", {
          bucket: SUPABASE_BUCKET,
          message: bucketError?.message ?? "Bucket not found",
        });
        if (!isDev) {
          return NextResponse.json(
            {
              message:
                "Storage bucket is unavailable. Check SUPABASE_STORAGE_BUCKET and SUPABASE_SERVICE_ROLE_KEY.",
              details: {
                bucket: SUPABASE_BUCKET,
                reason: bucketError?.message ?? "Bucket not found",
              },
            },
            { status: 502 }
          );
        }
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "images";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { message: "No file provided. Use form field 'file'." },
        { status: 400 }
      );
    }

    const allowedTypes =
      folder === "homework" || folder === "certificates" || folder === "circulars"
        ? [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES]
        : ALLOWED_IMAGE_TYPES;
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          message:
            folder === "homework" || folder === "certificates" || folder === "circulars"
              ? "Invalid file type. Use JPEG, PNG, WebP, GIF, PDF, or DOC/DOCX."
              : "Invalid file type. Use JPEG, PNG, WebP or GIF.",
        },
        { status: 400 }
      );
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      return NextResponse.json(
        { message: `File too large. Max ${MAX_SIZE_MB}MB.` },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
    // Multi-tenant storage isolation: keep each school's uploads in its own prefix.
    // For superadmin/global uploads (no schoolId), store under "global/".
    const tenantPrefix = schoolId && String(schoolId).trim() ? `schools/${schoolId}` : "global";
    const storagePath = `${tenantPrefix}/${folder}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    let data:
      | {
          path: string;
          id: string;
          fullPath: string;
        }
      | null = null;
    let error: {
      message: string;
      statusCode?: string;
      error?: string;
    } | null = null;

    for (let attempt = 1; supabaseAdmin && attempt <= 2; attempt++) {
      const result = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      data = result.data;
      error = result.error;

      if (!error || data?.path) break;
      if (attempt < 2 && isTransientUploadError(error.message || "")) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      break;
    }

    if (!error && data?.path && supabaseAdmin) {
      const { data: urlData } = supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(data.path);

      return NextResponse.json({ url: urlData.publicUrl, path: data.path, provider: "supabase" });
    }

    if (isDev) {
      const local = await saveLocally(file, folder, safeName);
      return NextResponse.json({ url: local.url, path: local.path, provider: "local-dev" });
    }

    if (error || !data?.path) {
      const details = {
        bucket: SUPABASE_BUCKET,
        path: storagePath,
        message: error?.message ?? "Unknown upload error",
        code: error?.statusCode ?? null,
        type: error?.error ?? null,
      };
      logger.error("Supabase upload error:", details);
      return NextResponse.json(
        {
          message: error?.message || "Upload failed at storage provider.",
          details,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ message: "Upload failed." }, { status: 502 });
  } catch (e) {
    logger.error("Upload API error:", e);
    return NextResponse.json(
      { message: toClientErrorMessage(e, "Internal server error") },
      { status: 500 }
    );
  }
}
