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
import {
  assignCatalogCacheKey,
  getAssignCatalogCache,
  setAssignCatalogCache,
  type AssignFeeCatalogResult,
} from "@/lib/assignFeeCatalogCache";

export type { AssignFeeCatalogResult } from "@/lib/assignFeeCatalogCache";

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

const inflight = new Map<string, Promise<AssignFeeCatalogResult>>();

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

function mapCatalogResponse(
  data: Record<string, unknown>,
  params: {
    classId?: string | null;
    section?: string | null;
    residencyType?: string | null;
  }
): AssignFeeCatalogResult {
  const classRows: ClassRow[] = Array.isArray(data.classes)
    ? (data.classes as { id: string; name: string; section?: string | null }[]).map((c) => ({
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

/** Single request for assign-fees picker; uses memory + session cache for instant reopen. */
export async function loadAssignFeeCatalog(params: {
  studentId: string;
  classId?: string | null;
  section?: string | null;
  residencyType?: string | null;
  classRows?: ClassRow[];
  force?: boolean;
}): Promise<AssignFeeCatalogResult> {
  const cacheKey = assignCatalogCacheKey(params);
  if (!params.force) {
    const cached = getAssignCatalogCache(cacheKey);
    if (cached) return cached;
  }

  const running = inflight.get(cacheKey);
  if (running) return running;

  const run = (async (): Promise<AssignFeeCatalogResult> => {
    const qs = new URLSearchParams();
    qs.set("studentId", params.studentId);
    if (params.classId?.trim()) qs.set("classId", params.classId.trim());
    if (params.section?.trim()) qs.set("section", params.section.trim());
    if (params.classRows?.length) qs.set("skipClasses", "1");

    const res = await fetch(`/api/fees/assign-catalog?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((data.message as string) || "Failed to load fee catalog");
    }

    const mapped = mapCatalogResponse(
      {
        ...data,
        classes: params.classRows?.length ? params.classRows : data.classes,
      },
      params
    );
    setAssignCatalogCache(cacheKey, mapped);
    return mapped;
  })();

  inflight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(cacheKey);
  }
}
