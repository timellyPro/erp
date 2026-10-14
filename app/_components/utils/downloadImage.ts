function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const dot = path.lastIndexOf(".");
    if (dot === -1) return "jpg";
    const ext = path.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    return ext && ext.length <= 5 ? ext : "jpg";
  } catch {
    return "jpg";
  }
}

/**
 * Download an image URL as a file in the browser (CORS permitting).
 * Falls back to opening the URL in a new tab if fetch fails.
 */
export async function downloadImageFromUrl(url: string, baseName: string): Promise<void> {
  const ext = extensionFromUrl(url);
  const safeBase = baseName.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 80) || "image";
  const filename = `${safeBase}.${ext}`;

  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
