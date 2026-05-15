import {
  buildCatalogHeadOptionsFromExtras,
  dedupeCatalogFeeHeadOptions,
  type CatalogFeeHeadOption,
} from "@/lib/extraFeeCatalogOptions";
import { filterCatalogExtrasForStudentPicker, type ClassRow } from "@/lib/extraFeeCatalogFilter";
import {
  extraFeeAppliesToStudent,
  normalizeExtraFeeResidencyScope,
  suggestedResidencyScopeForExtraFeeName,
} from "@/lib/extraFeeResidencyScope";

export type AssignFeeCatalogResult = {
  dbFeeHeadOptions: CatalogFeeHeadOption[];
  existingStudentExtras: Array<{
    id: string;
    name: string;
    amount: number;
    splitIntoTwoInstallments: boolean;
  }>;
  classBaseFeeTotal: number | null;
  classRows: ClassRow[];
  resolvedClassId: string | null;
  resolvedSection: string | null;
};

type CatalogApiExtra = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope?: string | null;
  splitIntoTwoInstallments?: boolean;
};

function formatCatalogExtraScope(
  x: { targetType?: string | null; targetClassId?: string | null; targetSection?: string | null },
  classById: Map<string, string>
): string {
  const t = String(x.targetType ?? "");
  if (t === "SCHOOL") return "School-wide";
  const classLabel = x.targetClassId ? classById.get(String(x.targetClassId)) : undefined;
  if (t === "CLASS") return classLabel ? `Class ${classLabel}` : "Class-specific";
  if (t === "SECTION") {
    const sec = x.targetSection ? String(x.targetSection) : "";
    if (classLabel && sec) return `${classLabel} · section ${sec}`;
    if (classLabel) return `${classLabel} · section`;
    return "Section-specific";
  }
  return t || "—";
}

/** Single request for assign-fees picker data (replaces /extra + /templates + /student + /structure). */
export async function loadAssignFeeCatalog(params: {
  studentId: string;
  classId?: string | null;
  section?: string | null;
  residencyType?: string | null;
}): Promise<AssignFeeCatalogResult> {
  const qs = new URLSearchParams();
  qs.set("studentId", params.studentId);
  if (params.classId?.trim()) qs.set("classId", params.classId.trim());
  if (params.section?.trim()) qs.set("section", params.section.trim());

  const res = await fetch(`/api/fees/assign-catalog?${qs.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || "Failed to load fee catalog");
  }

  const classRows: ClassRow[] = Array.isArray(data.classes)
    ? data.classes.map((c: { id: string; name: string; section?: string | null }) => ({
        id: String(c.id),
        name: String(c.name ?? ""),
        section: c.section ?? null,
      }))
    : [];

  const classById = new Map(classRows.map((c) => [c.id, `${c.name}${c.section ? `-${c.section}` : ""}`]));

  const resolvedClassId = (data.resolvedClassId as string | null) ?? params.classId ?? null;
  const resolvedSection = (data.resolvedSection as string | null) ?? params.section ?? null;

  const templateHeads: CatalogFeeHeadOption[] = (Array.isArray(data.templates) ? data.templates : [])
    .map(
      (x: {
        id?: string;
        name?: string;
        amount?: number;
        splitIntoTwoInstallments?: boolean;
      }): CatalogFeeHeadOption | null => {
        const id = String(x.id ?? "");
        const name = String(x.name ?? "").trim();
        const amount = Number(x.amount ?? 0);
        if (!id || !name || !Number.isFinite(amount) || amount <= 0) return null;
        return {
          key: `template:${id}`,
          name,
          amount,
          selected: false,
          scopeLabel: "Custom saved head",
          residencyScope: normalizeExtraFeeResidencyScope(suggestedResidencyScopeForExtraFeeName(name)),
          splitIntoTwoInstallments: Boolean(x.splitIntoTwoInstallments),
        };
      }
    )
    .filter((h: CatalogFeeHeadOption | null): h is CatalogFeeHeadOption => h !== null);

  const catalogExtras = filterCatalogExtrasForStudentPicker(
    (Array.isArray(data.catalogExtras) ? data.catalogExtras : []) as CatalogApiExtra[],
    { classId: resolvedClassId, section: resolvedSection },
    { classRows }
  );

  const catalogHeads = buildCatalogHeadOptionsFromExtras(catalogExtras, (x) =>
    formatCatalogExtraScope(
      {
        targetType: x.targetType,
        targetClassId: x.targetClassId,
        targetSection: x.targetSection,
      },
      classById
    )
  );

  const dbFeeHeadOptions = dedupeCatalogFeeHeadOptions(
    [...templateHeads, ...catalogHeads].filter((h) =>
      extraFeeAppliesToStudent(
        { name: h.name, residencyScope: h.residencyScope },
        params.residencyType
      )
    )
  ).sort((a, b) => a.name.localeCompare(b.name) || a.scopeLabel.localeCompare(b.scopeLabel));

  return {
    dbFeeHeadOptions,
    existingStudentExtras: Array.isArray(data.existingStudentExtras) ? data.existingStudentExtras : [],
    classBaseFeeTotal:
      typeof data.classBaseFeeTotal === "number" && Number.isFinite(data.classBaseFeeTotal)
        ? data.classBaseFeeTotal
        : null,
    classRows,
    resolvedClassId,
    resolvedSection,
  };
}
