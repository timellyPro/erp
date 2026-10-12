export type ComparisonRow = {
  key: string;
  category: "FEES" | "PETTY_CASH";
  head: string;
  rangeAAmount: number;
  rangeBAmount: number;
  difference: number;
  rangeACount: number;
  rangeBCount: number;
};

export type ComparisonReport = {
  rangeA: { from: string; to: string };
  rangeB: { from: string; to: string };
  rows: ComparisonRow[];
  totals: {
    rangeAAmount: number;
    rangeBAmount: number;
    difference: number;
  };
};

export type SchoolMeta = {
  name: string;
  address: string;
  logoUrl: string | null;
};

export function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export function formatInr(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function rangeLabel(range: { from: string; to: string }) {
  return `${formatDate(range.from)} - ${formatDate(range.to)}`;
}

export function normalizeLogoUrl(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let url = raw.trim();
  if (url.includes("/storage/v1/object/")) {
    url = `/api/media?url=${encodeURIComponent(url)}`;
  }
  if (url.startsWith("/") && typeof window !== "undefined") {
    url = `${window.location.origin}${url}`;
  }
  return url;
}

export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
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

export async function fetchSchoolMeta(): Promise<SchoolMeta> {
  try {
    const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const data = await res.json();
    const school = data?.school ?? {};
    const addressParts = [school.address, school.location]
      .filter((v: unknown) => typeof v === "string" && String(v).trim())
      .map((v: unknown) => String(v).trim());
    const address = addressParts
      .filter((part, idx) => addressParts.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx)
      .join(", ");
    return {
      name: String(school.name || "School"),
      address: address || "Address not available",
      logoUrl: normalizeLogoUrl(
        typeof school.logoUrl === "string" && school.logoUrl.trim()
          ? school.logoUrl
          : school.admins?.[0]?.photoUrl ?? null
      ),
    };
  } catch {
    return { name: "School", address: "Address not available", logoUrl: null };
  }
}
