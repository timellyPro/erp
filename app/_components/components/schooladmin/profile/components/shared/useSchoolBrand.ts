import { useEffect, useState } from "react";

export function useSchoolBrand() {
  const [schoolBrand, setSchoolBrand] = useState<{
    name: string;
    address: string;
    logo: string | null;
  }>({ name: "", address: "", logo: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
        const d = await res.json();
        if (!res.ok || cancelled) return;

        const name = typeof d?.school?.name === "string" ? d.school.name : "";
        const addressParts = [d?.school?.address, d?.school?.location]
          .filter((v: unknown) => typeof v === "string" && String(v).trim())
          .map((v: unknown) => String(v).trim());
        const address = addressParts
          .filter((part, idx) => addressParts.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx)
          .join(", ");

        let rawLogo: string | null =
          typeof d?.school?.logoUrl === "string" && d.school.logoUrl.trim()
            ? d.school.logoUrl.trim()
            : null;
        if (!rawLogo && Array.isArray(d?.school?.admins) && d.school.admins[0]?.photoUrl) {
          rawLogo = String(d.school.admins[0].photoUrl).trim();
        }
        if (!rawLogo) {
          try {
            const ur = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
            const ud = await ur.json();
            if (typeof ud?.user?.photoUrl === "string" && ud.user.photoUrl.trim()) {
              rawLogo = ud.user.photoUrl.trim();
            }
          } catch {
            /* noop */
          }
        }

        let logoData: string | null = null;
        if (rawLogo) {
          let parsed = rawLogo;
          if (parsed.includes("/storage/v1/object/")) {
            parsed = `/api/media?url=${encodeURIComponent(parsed)}`;
          }
          if (parsed.startsWith("/")) {
            parsed = `${window.location.origin}${parsed}`;
          }
          try {
            const imgRes = await fetch(parsed);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              logoData = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string) || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch {
            logoData = null;
          }
        }

        if (!logoData && name) {
          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=128&background=4ade80&color=fff`;
          try {
            const fr = await fetch(fallback);
            if (fr.ok) {
              const blob = await fr.blob();
              logoData = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string) || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch {
            /* noop */
          }
        }

        if (!cancelled) {
          setSchoolBrand({ name: name || "School", address: address || "-", logo: logoData });
        }
      } catch {
        if (!cancelled) {
          setSchoolBrand({ name: "School", address: "-", logo: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return schoolBrand;
}
