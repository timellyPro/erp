"use client";

import { Search, Users, GraduationCap, Building2, TrendingUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "../common/PageHeader";
import { formatAmount as fmtAmount } from "../../utils/format";
import Spinner from "../common/Spinner";
import SearchInput from "../common/SearchInput";
import TableLayout from "../common/TableLayout";
import { Column } from "../../types/superadmin";
import { useDebounce } from "@/app/frontend/hooks/useDebounce";
import { AVATAR_URL } from "../../constants/images";

export interface SchoolRow {
  slNo: number;
  id: string;
  name: string;
  address: string;
  location: string;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  turnover: number;
  admin: {
    id: string;
    name: string;
    email: string;
    mobile: string;
    role: string;
    photoUrl?: string | null;
  } | null;
}

function SchoolsPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-xs text-white/60">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-full px-4 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

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

type SchoolsProps = {
  /** "remove" tab: same list, copy emphasizes permanent school deletion. */
  variant?: "default" | "remove";
};

export default function Schools({ variant = "default" }: SchoolsProps) {
  const router = useRouter();
  const PAGE_SIZE = 10;
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [modalSchool, setModalSchool] = useState<SchoolRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSchools = useCallback(
    async (searchTerm: string, opts?: { silent?: boolean; cacheBust?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
        if (opts?.cacheBust) params.set("_t", String(Date.now()));
        const res = await fetch(`/api/superadmin/schools?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load schools");
        setSchools(data.schools ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error loading schools");
        if (!silent) setSchools([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setPage(1);
    void fetchSchools(debouncedSearch);
  }, [debouncedSearch, fetchSchools]);

  const totalPages = Math.max(1, Math.ceil(schools.length / PAGE_SIZE));
  const paginatedSchools = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return schools.slice(start, start + PAGE_SIZE);
  }, [page, schools]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleConfirmDeleteSchool = async () => {
    if (!modalSchool) return;
    const deletedId = modalSchool.id;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/superadmin/schools/${modalSchool.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolName: confirmName }),
        cache: "no-store",
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message || "Delete failed");
      setModalSchool(null);
      setConfirmName("");
      setSchools((prev) => prev.filter((s) => s.id !== deletedId));
      await fetchSchools(debouncedSearch, { silent: true, cacheBust: true });
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns = useMemo<Column<SchoolRow>[]>(
    () => [
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
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmName("");
              setModalSchool(s);
            }}
            className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20 transition disabled:opacity-50"
            title="Delete school and all related data"
            aria-label={`Delete ${s.name}`}
            disabled={deleteBusy}
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        ),
      },
    ],
    [deleteBusy]
  );

  return (
    <main className="flex-1 min-w-0 w-full max-w-[1600px] mx-auto flex flex-col">
      <div className="w-full min-h-0 space-y-4 sm:space-y-6">
        <PageHeader
          title={variant === "remove" ? "Remove schools" : "Schools"}
          subtitle={
            variant === "remove"
              ? "Delete a school only after you export anything you need. Staff and student logins for that school only are removed."
              : "Schools, admins, students, and turnover"
          }
          className="rounded-2xl sm:rounded-3xl"
          rightSlot={
            <div className="w-full md:max-w-sm lg:max-w-md">
              <SearchInput
                value={search}
                onChange={setSearch}
                icon={Search}
                iconPosition="right"
                placeholder="Search school, admin, email…"
                variant="glass"
              />
            </div>
          }
        />

        {error && (
          <div className="text-red-400 text-sm py-1 px-1" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Mobile & tablet: cards */}
            <div className="lg:hidden space-y-3">
              {paginatedSchools.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/3 px-4 py-12 text-center text-sm text-white/50">
                  No schools match your search.
                </div>
              ) : (
                paginatedSchools.map((s) => {
                  const place = [s.location, s.address].filter(Boolean).join(" · ") || "—";
                  const tel = s.admin?.mobile?.replace(/\s/g, "");
                  return (
                    <article
                      key={s.id}
                      className="rounded-2xl border border-white/10 bg-white/4 backdrop-blur-sm p-4 shadow-lg shadow-black/20"
                    >
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

                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmName("");
                          setModalSchool(s);
                        }}
                        disabled={deleteBusy}
                        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                        Delete school
                      </button>
                    </article>
                  );
                })
              )}
              <SchoolsPagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>

            {/* Desktop: table */}
            <div className="hidden lg:block space-y-4">
              <TableLayout
                columns={columns}
                data={paginatedSchools}
                emptyText="No schools match your search."
                rowKey={(row) => row.id}
                tableClassName="table-auto w-full min-w-[1000px]"
                tdClassName="whitespace-normal align-middle"
                pagination={{
                  page,
                  totalPages,
                  onChange: setPage,
                }}
              />
            </div>
          </>
        )}
      </div>

      {modalSchool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-school-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/95 p-5 shadow-2xl shadow-black/50">
            <h2 id="delete-school-title" className="text-lg font-semibold text-white">
              Delete school
            </h2>
            <p className="mt-2 text-sm text-white/70 leading-relaxed">
              This removes{" "}
              <span className="font-medium text-white">{modalSchool.name}</span> and related records:
              students, classes, fees, payments, news, homework, exams, admissions, and staff accounts that
              exist only for this school. This cannot be undone.
            </p>
            <label htmlFor="confirm-school-name" className="mt-4 block text-xs font-medium text-white/50">
              Type the school name to confirm
            </label>
            <input
              id="confirm-school-name"
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              placeholder={modalSchool.name}
              disabled={deleteBusy}
            />
            {deleteError && (
              <p className="mt-2 text-sm text-red-400" role="alert">
                {deleteError}
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!deleteBusy) {
                    setModalSchool(null);
                    setConfirmName("");
                    setDeleteError(null);
                  }
                }}
                disabled={deleteBusy}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/5 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteSchool()}
                disabled={
                  deleteBusy || confirmName.trim() !== modalSchool.name.trim()
                }
                className="rounded-xl border border-red-500/50 bg-red-600/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
