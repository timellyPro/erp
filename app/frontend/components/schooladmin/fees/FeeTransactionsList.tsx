"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import SelectInput from "../../common/SelectInput";
import SearchInput from "../../common/SearchInput";
import RefundModal, { type TransactionItem } from "./RefundModal";
import type { Student } from "./types";
import { schoolAdminStudentDetailsFeesUrl } from "./studentDetailsNav";
import InlinePagination from "../schooladmincomponents/InlinePagination";

const PAGE_SIZE = 20;

interface FeeTransactionsListProps {
  students: Student[];
  onSuccess: () => void;
}

interface ClassItem {
  id: string;
  name: string;
  section: string | null;
}

interface ClassDetailStudent {
  id: string;
  admissionNumber: string;
  user?: { name?: string | null } | null;
  class?: { section?: string | null } | null;
}

export default function FeeTransactionsList({ students: _students, onSuccess }: FeeTransactionsListProps) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [classLoading, setClassLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [classStudents, setClassStudents] = useState<ClassDetailStudent[]>([]);
  const [refundTarget, setRefundTarget] = useState<TransactionItem | null>(null);
  const [page, setPage] = useState(1);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fees/transactions");
      const data = await res.json();
      if (res.ok) {
        setTransactions(data.transactions || []);
      } else {
        setTransactions([]);
      }
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    setClassLoading(true);
    try {
      const res = await fetch("/api/class/list");
      const data = await res.json();
      if (res.ok) {
        setClasses(Array.isArray(data.classes) ? data.classes : []);
      } else {
        setClasses([]);
      }
    } catch {
      setClasses([]);
    } finally {
      setClassLoading(false);
    }
  };

  const fetchClassDetails = async (classId: string) => {
    if (!classId) {
      setClassStudents([]);
      setSelectedSection("");
      return;
    }
    setSectionLoading(true);
    try {
      const res = await fetch(`/api/class/${encodeURIComponent(classId)}`);
      const data = await res.json();
      if (res.ok && data.class) {
        setSelectedSection("");
        setClassStudents(Array.isArray(data.class.students) ? data.class.students : []);
      } else {
        setSelectedSection("");
        setClassStudents([]);
      }
    } catch {
      setSelectedSection("");
      setClassStudents([]);
    } finally {
      setSectionLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    fetchClassDetails(selectedClassId);
  }, [selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const sectionOptions = useMemo(() => {
    if (!selectedClass) return [];
    const sectionFromClass = selectedClass.section || "";
    const sectionFromStudents = Array.from(
      new Set(
        classStudents
          .map((s) => s.class?.section || "")
          .filter((x) => x !== "")
      )
    );
    const unique = Array.from(new Set([sectionFromClass, ...sectionFromStudents].filter(Boolean)));
    return [
      { label: "All Sections", value: "" },
      ...unique.map((s) => ({ label: s, value: s })),
    ];
  }, [selectedClass, classStudents]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        transactions.map((t) => String(new Date(t.createdAt).getFullYear()))
      )
    ).sort((a, b) => Number(b) - Number(a));
    return [
      { label: "All Years", value: "" },
      ...years.map((y) => ({ label: y, value: y })),
    ];
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const txClassName = t.student.class?.name || "";
      const txSection = t.student.class?.section || "";
      const txYear = String(new Date(t.createdAt).getFullYear());
      const txStudentName = t.student.user?.name || "";
      const txAdmission = t.student.admissionNumber || "";

      const matchClass = selectedClass ? txClassName === selectedClass.name : true;
      const matchSection = selectedSection ? txSection === selectedSection : true;
      const matchYear = selectedYear ? txYear === selectedYear : true;
      const search = studentSearch.trim().toLowerCase();
      const matchStudent =
        !search ||
        txStudentName.toLowerCase().includes(search) ||
        txAdmission.toLowerCase().includes(search);

      return matchClass && matchSection && matchYear && matchStudent;
    });
  }, [transactions, selectedClass, selectedSection, selectedYear, studentSearch]);

  useEffect(() => {
    setPage(1);
  }, [selectedClassId, selectedSection, selectedYear, studentSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(
    () => filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTransactions, page]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold mb-4 flex flex-wrap items-center gap-2">
        <RotateCcw className="w-5 h-5 shrink-0 text-amber-400" />
        <span>
          {`Fee Transactions & Refunds (${filteredTransactions.length}${
            filteredTransactions.length > PAGE_SIZE
              ? ` · rows ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredTransactions.length)}`
              : ""
          })`}
        </span>
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        View successful payments and process refunds when needed.
      </p>
      <div className="mb-5 w-full rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <SearchInput
              label="Search Student"
              value={studentSearch}
              onChange={setStudentSearch}
              icon={Search}
              showSearchIcon
              placeholder="Name or ID..."
              variant="glass"
            />
          </div>
          <div>
            <SelectInput
              label="Year"
              value={selectedYear}
              onChange={setSelectedYear}
              options={yearOptions}
            />
          </div>
          <div>
            <SelectInput
              label="Class"
              value={selectedClassId}
              onChange={setSelectedClassId}
              disabled={classLoading}
              options={[
                { label: "All Classes", value: "" },
                ...classes.map((c) => ({
                  label: c.name,
                  value: c.id,
                })),
              ]}
            />
          </div>
          <div>
            <SelectInput
              label="Section"
              value={selectedSection}
              onChange={setSelectedSection}
              disabled={!selectedClassId || sectionLoading}
              options={
                selectedClassId
                  ? sectionOptions
                  : [{ label: "All Sections", value: "" }]
              }
            />
          </div>
        </div>
      </div>
      {loading ? (
        <div className="py-8 text-center text-gray-400">Loading transactions...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No transactions found</div>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {paginatedTransactions.map((t) => (
              <div key={t.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <button
                  type="button"
                  className="text-left text-base font-semibold text-white underline-offset-2 hover:underline"
                  onMouseEnter={() => router.prefetch(schoolAdminStudentDetailsFeesUrl(t.student.id))}
                  onClick={() => router.push(schoolAdminStudentDetailsFeesUrl(t.student.id))}
                >
                  {t.student.user?.name || t.student.admissionNumber || "-"}
                </button>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400">Date</span>
                    <span className="text-right text-white">
                      {new Date(t.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400">Class</span>
                    <span className="text-right text-white">
                      {t.student.class
                        ? `${t.student.class.name}${t.student.class.section ? `-${t.student.class.section}` : ""}`
                        : "-"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-gray-400">Gateway</span>
                    <div className="text-right text-gray-300">
                      <div>{t.gateway}</div>
                      {t.hyperpgStatus ? (
                        <div className="text-xs text-gray-500">
                          {t.hyperpgStatus}
                          {typeof t.hyperpgStatusId === "number" ? ` (${t.hyperpgStatusId})` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400">Reference / UTR</span>
                    <span className="text-right text-gray-300 break-all">
                      {t.transactionId || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400">Amount</span>
                    <span className="text-emerald-400">₹{t.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400">Refunded</span>
                    {t.refundable < t.amount ? (
                      <span className="text-amber-400">
                        ₹{(t.amount - t.refundable).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                  <div className="pt-2">
                    {t.refundable > 0 ? (
                      <button
                        onClick={() => setRefundTarget(t)}
                        className="w-full rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/30"
                      >
                        Refund
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">Full refund</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="-mx-4 hidden overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-white/10">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Student</th>
                <th className="pb-3 font-medium">Class</th>
                <th className="pb-3 font-medium">Gateway</th>
                <th className="pb-3 font-medium">Reference No / UTR</th>
                <th className="pb-3 font-medium">Amount</th>
                <th className="pb-3 font-medium">Refunded</th>
                <th className="pb-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="py-3 text-gray-400 whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td
                    className="py-3 text-white font-medium cursor-pointer select-none underline-offset-2 hover:underline"
                    title="Double-click to open student fee details"
                    onMouseEnter={() => router.prefetch(schoolAdminStudentDetailsFeesUrl(t.student.id))}
                    onDoubleClick={() => router.push(schoolAdminStudentDetailsFeesUrl(t.student.id))}
                  >
                    {t.student.user?.name || t.student.admissionNumber || "-"}
                  </td>
                  <td className="py-3 text-gray-400">
                    {t.student.class
                      ? `${t.student.class.name}${t.student.class.section ? `-${t.student.class.section}` : ""}`
                      : "-"}
                  </td>
                  <td className="py-3 text-gray-400">
                    <div className="flex flex-col">
                      <span>{t.gateway}</span>
                      {t.hyperpgStatus ? (
                        <span className="text-xs text-gray-500">
                          {t.hyperpgStatus}
                          {typeof t.hyperpgStatusId === "number" ? ` (${t.hyperpgStatusId})` : ""}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3 text-gray-300 break-all">
                    {t.transactionId || "-"}
                  </td>
                  <td className="py-3 text-emerald-400">₹{t.amount.toLocaleString()}</td>
                  <td className="py-3">
                    {t.refundable < t.amount ? (
                      <span className="text-amber-400">
                        ₹{(t.amount - t.refundable).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {t.refundable > 0 ? (
                      <button
                        onClick={() => setRefundTarget(t)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium"
                      >
                        Refund
                      </button>
                    ) : (
                      <span className="text-gray-500 text-xs">Full refund</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="mt-4">
            <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </>
      )}

      <RefundModal
        transaction={refundTarget}
        onClose={() => setRefundTarget(null)}
        onSuccess={() => {
          fetchTransactions();
          onSuccess();
        }}
      />
    </section>
  );
}
