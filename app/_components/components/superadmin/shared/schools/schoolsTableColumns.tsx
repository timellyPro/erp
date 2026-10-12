import { Download, Trash2 } from "lucide-react";
import { formatAmount as fmtAmount } from "../../../../utils/format";
import { Column } from "../../../../types/superadmin";
import { AVATAR_URL } from "../../../../constants/images";
import type { SchoolRow } from "../../Schools";

export function buildSchoolsColumns({
  deleteBusy,
  exportingSchoolId,
  onDownload,
  onRequestDelete,
}: {
  deleteBusy: boolean;
  exportingSchoolId: string | null;
  onDownload: (s: SchoolRow) => void;
  onRequestDelete: (s: SchoolRow) => void;
}): Column<SchoolRow>[] {
  return [
    {
      header: "#",
      align: "center",
      render: (s) => String(s.slNo).padStart(2, "0"),
    },
    {
      header: "School",
      render: (s) => {
        const fallback = AVATAR_URL;
        const avatar = s.admin?.photoUrl?.trim() ? s.admin.photoUrl : fallback;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={avatar}
              alt=""
              className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.src = fallback;
              }}
            />
            <span className="text-white font-medium wrap-break-word">{s.name}</span>
          </div>
        );
      },
    },
    {
      header: "Admin",
      align: "center",
      render: (s) => (
        <span className="text-white/90 wrap-break-word">{s.admin?.name ?? "—"}</span>
      ),
    },
    {
      header: "Contact",
      align: "center",
      render: (s) => (
        <span className="text-white/80 tabular-nums whitespace-nowrap">{s.admin?.mobile ?? "—"}</span>
      ),
    },
    {
      header: "Email",
      align: "center",
      render: (s) => (
        <span className="text-white/80 wrap-break-word inline-block max-w-[220px]">
          {s.admin?.email ?? "—"}
        </span>
      ),
    },
    {
      header: "Students",
      align: "center",
      render: (s) => (
        <span className="tabular-nums">{s.studentCount.toLocaleString()}</span>
      ),
    },
    {
      header: "Turnover",
      align: "center",
      render: (s) => (
        <span className="text-lime-300 font-medium tabular-nums whitespace-nowrap">
          {fmtAmount(s.turnover, true)}
        </span>
      ),
    },
    {
      header: "",
      align: "right",
      render: (s) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onDownload(s)}
            className="inline-flex items-center justify-center rounded-lg border border-lime-400/40 bg-lime-500/10 p-2 text-lime-200 hover:bg-lime-500/20 transition disabled:opacity-50"
            title="Download full fees backup (Excel)"
            aria-label={`Download fees backup for ${s.name}`}
            disabled={exportingSchoolId === s.id || deleteBusy}
          >
            {exportingSchoolId === s.id ? (
              <span className="w-4 h-4 border-2 border-lime-200/30 border-t-lime-200 rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(s)}
            className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
            title="Delete school and all related data"
            aria-label={`Delete ${s.name}`}
            disabled={deleteBusy || exportingSchoolId === s.id}
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      ),
    },
  ];
}
