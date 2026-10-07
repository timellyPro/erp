export type SchoolBrand = {
  name: string;
  address: string;
  logo: string | null;
};

let cachedBrand: SchoolBrand | null = null;
let inflightBrand: Promise<SchoolBrand> | null = null;

async function fetchSchoolBrand(): Promise<SchoolBrand> {
  const empty: SchoolBrand = { name: "School", address: "-", logo: null };
  try {
    const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const d = await res.json();
    if (!res.ok || !d?.school) return empty;

    const name = typeof d.school.name === "string" ? d.school.name : "School";
    const addressParts = [d.school.address, d.school.location]
      .filter((v: unknown) => typeof v === "string" && String(v).trim())
      .map((v: unknown) => String(v).trim());
    const address = addressParts
      .filter((part, idx) => addressParts.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx)
      .join(", ");

    let rawLogo: string | null =
      typeof d.school.logoUrl === "string" && d.school.logoUrl.trim() ? d.school.logoUrl.trim() : null;
    if (!rawLogo && Array.isArray(d.school.admins) && d.school.admins[0]?.photoUrl) {
      rawLogo = String(d.school.admins[0].photoUrl).trim();
    }

    let logo: string | null = null;
    if (rawLogo) {
      let parsed = rawLogo;
      if (parsed.includes("/storage/v1/object/")) {
        parsed = `/api/media?url=${encodeURIComponent(parsed)}`;
      }
      if (parsed.startsWith("/") && typeof window !== "undefined") {
        parsed = `${window.location.origin}${parsed}`;
      }
      try {
        const imgRes = await fetch(parsed);
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          logo = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string) || null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        }
      } catch {
        logo = null;
      }
    }

    return { name, address: address || "-", logo };
  } catch {
    return empty;
  }
}

/** Fetch school name/address/logo as data URL for PDF capture (cached in-memory). */
export async function resolveSchoolBrand(opts?: { force?: boolean }): Promise<SchoolBrand> {
  if (!opts?.force && cachedBrand) return cachedBrand;
  if (!opts?.force && inflightBrand) return inflightBrand;

  inflightBrand = fetchSchoolBrand()
    .then((brand) => {
      cachedBrand = brand;
      return brand;
    })
    .finally(() => {
      inflightBrand = null;
    });

  return inflightBrand;
}

export function peekSchoolBrand(): SchoolBrand | null {
  return cachedBrand;
}

export function currentAcademicYearLabel(seed = new Date()) {
  const startYear = seed.getMonth() >= 3 ? seed.getFullYear() : seed.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}
