import { Users, GraduationCap, Building2, TrendingUp, Download, Trash2 } from "lucide-react";
import Pagination from "@/app/_components/components/common/Pagination";
import { formatAmount as fmtAmount } from "../../../../utils/format";
import { AVATAR_URL } from "../../../../constants/images";
import type { SchoolRow } from "../../Schools";

function SchoolAvatar({ school }: { school: SchoolRow }) {
  const fallback = AVATAR_URL;
  const avatar = school.admin?.photoUrl?.trim() ? school.admin.photoUrl : fallback;
  return (
    <img
      src={avatar}
      alt=""
      className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border border-white/20 shrink-0"
      loading="lazy"
      onError={(e) => {
        e.currentTarget.src = fallback;
      }}
    />
  );
}

export function SchoolMobileCard({
  school: s,
  exportingSchoolId,
  deleteBusy,
  onDownload,
  onRequestDelete,
}: {
  school: SchoolRow;
  exportingSchoolId: string | null;
  deleteBusy: boolean;
  onDownload: (s: SchoolRow) => void;
  onRequestDelete: (s: SchoolRow) => void;
}) {
  const place = [s.location, s.address].filter(Boolean).join(" · ") || "—";
  const tel = s.admin?.mobile?.replace(/\s/g, "");
  return (
    <article className="rounded-2xl border border-white/10 bg-white/4 backdrop-blur-sm p-4 shadow-lg shadow-black/20">
      <div className="flex gap-3 min-w-0">
        <SchoolAvatar school={s} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-white leading-snug wrap-break-word">
              {s.name}
            </h3>
            <span className="shrink-0 text-[10px] font-mono text-white/35 tabular-nums pt-0.5">
              #{String(s.slNo).padStart(2, "0")}
            </span>
          </div>
          <p className="text-xs text-white/45 mt-1 line-clamp-2">{place}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-black/25 border border-white/5 px-3 py-2.5 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">
          Admin
        </p>
        <p className="text-sm text-white/90 wrap-break-word">
          {s.admin?.name ?? "—"}
        </p>
        <div className="flex flex-col gap-1.5 text-xs">
          {tel ? (
            <a
              href={`tel:${tel}`}
              className="text-lime-300/90 hover:underline tabular-nums"
            >
              {s.admin?.mobile}
            </a>
          ) : (
            <span className="text-white/40">—</span>
          )}
          {s.admin?.email ? (
            <a
              href={`mailto:${s.admin.email}`}
              className="text-white/70 hover:text-lime-200/90 wrap-break-word break-all"
            >
              {s.admin.email}
            </a>
          ) : (
            <span className="text-white/40">—</span>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:text-sm">
        <div className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-2 border border-white/5">
          <Users className="w-4 h-4 text-white/35 shrink-0 mt-0.5" aria-hidden />
          <div>
            <dt className="text-white/45">Students</dt>
            <dd className="text-white font-medium tabular-nums mt-0.5">
              {s.studentCount.toLocaleString()}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-2 border border-white/5">
          <GraduationCap className="w-4 h-4 text-white/35 shrink-0 mt-0.5" aria-hidden />
          <div>
            <dt className="text-white/45">Teachers</dt>
            <dd className="text-white font-medium tabular-nums mt-0.5">
              {s.teacherCount.toLocaleString()}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-2 border border-white/5">
          <Building2 className="w-4 h-4 text-white/35 shrink-0 mt-0.5" aria-hidden />
          <div>
            <dt className="text-white/45">Classes</dt>
            <dd className="text-white font-medium tabular-nums mt-0.5">
              {s.classCount.toLocaleString()}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-2 border border-white/5">
          <TrendingUp className="w-4 h-4 text-lime-400/50 shrink-0 mt-0.5" aria-hidden />
          <div>
            <dt className="text-white/45">Turnover</dt>
            <dd className="text-lime-300 font-semibold tabular-nums mt-0.5">
              {fmtAmount(s.turnover, true)}
            </dd>
          </div>
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onDownload(s)}
          disabled={exportingSchoolId === s.id || deleteBusy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-lime-400/40 bg-lime-500/10 px-3 py-2.5 text-sm font-semibold text-lime-100 hover:bg-lime-500/20 transition disabled:opacity-50"
        >
          {exportingSchoolId === s.id ? (
            <span className="w-4 h-4 border-2 border-lime-200/30 border-t-lime-200 rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4 shrink-0" aria-hidden />
          )}
          {exportingSchoolId === s.id ? "Preparing…" : "Fees backup"}
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(s)}
          disabled={deleteBusy || exportingSchoolId === s.id}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20 transition disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
          Delete school
        </button>
      </div>
    </article>
  );
}

/** Thin alias kept for existing import sites — see app/_components/components/common/Pagination. */
export function SchoolsPagination(props: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return <Pagination {...props} />;
}
