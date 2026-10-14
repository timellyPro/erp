import type { useRouter } from "next/navigation";
import type { FeeRecord } from "../types";
import { schoolAdminStudentDetailsFeesUrl, warmSchoolAdminStudentDetails } from "../studentDetailsNav";
import { isInactiveStudentStatus } from "@/lib/students/resolveStudentDisplayClass";
import { formatRupee, roundRupee } from "@/lib/formatRupee";

export function FeeRecordsRows({
  paginatedFees,
  router,
}: {
  paginatedFees: FeeRecord[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <>
      <div className="space-y-3 sm:hidden">
        {paginatedFees.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-sm text-gray-400">
            No fee records found.
          </div>
        ) : (
          paginatedFees.map((f) => (
            <div key={f.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
              <button
                type="button"
                className="text-left text-base font-semibold text-white underline-offset-2 hover:underline"
                onMouseEnter={() => {
                  warmSchoolAdminStudentDetails(f.student.id);
                  router.prefetch(schoolAdminStudentDetailsFeesUrl(f.student.id));
                }}
                onClick={() => router.push(schoolAdminStudentDetailsFeesUrl(f.student.id))}
              >
                {f.student.user?.name || "-"}
              </button>
              {isInactiveStudentStatus(f.student.status) ? (
                <span className="ml-2 inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-200">
                  Inactive
                </span>
              ) : null}
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Class</span>
                  <span className="text-right text-white">
                    {f.student.class
                      ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
                      : "-"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-gray-400">Fee Type</span>
                  <span className="text-right text-gray-300">
                    {f.feeTypes
                      ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${formatRupee(f.feeTypeDueAmount)})` : ""}`
                      : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Total</span>
                  <span className="text-white">₹{formatRupee(f.finalFee)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Discount</span>
                  <span className="text-cyan-300">
                    {roundRupee(f.discountPercent)}% (₹
                    {formatRupee(Math.max((f.totalFee || 0) - (f.finalFee || 0), 0))})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Paid</span>
                  <span className="text-emerald-400">₹{formatRupee(f.amountPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Pending</span>
                  <span className="text-amber-400">₹{formatRupee(f.remainingFee)}</span>
                </div>
                <div className="pt-1">
                  <span
                    className={`inline-flex rounded px-2 py-1 text-xs ${
                      f.remainingFee <= 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.remainingFee <= 0 ? "Paid" : "Pending"}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="-mx-4 hidden overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-white/10">
              <th className="py-3">Student</th>
              <th className="py-3">Class</th>
              <th className="py-3">Fee Type</th>
              <th className="py-3">Total</th>
              <th className="py-3">Discount</th>
              <th className="py-3">Paid</th>
              <th className="py-3">Pending</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedFees.map((f) => (
              <tr key={f.id} className="border-b border-white/5">
                <td
                  className="py-3 cursor-pointer select-none underline-offset-2 hover:underline text-white/95"
                  title="Double-click to open student fee details"
                  onMouseEnter={() => {
                    warmSchoolAdminStudentDetails(f.student.id);
                    router.prefetch(schoolAdminStudentDetailsFeesUrl(f.student.id));
                  }}
                  onDoubleClick={() => router.push(schoolAdminStudentDetailsFeesUrl(f.student.id))}
                >
                  {f.student.user?.name || "-"}
                  {isInactiveStudentStatus(f.student.status) ? (
                    <span className="ml-2 inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-200">
                      Inactive
                    </span>
                  ) : null}
                </td>
                <td className="py-3">
                  {f.student.class
                    ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
                    : "-"}
                </td>
                <td className="py-3 text-gray-300">
                  {f.feeTypes
                    ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${formatRupee(f.feeTypeDueAmount)})` : ""}`
                    : "-"}
                </td>
                <td className="py-3">₹{formatRupee(f.finalFee)}</td>
                <td className="py-3 text-cyan-300">
                  {roundRupee(f.discountPercent)}% (₹
                  {formatRupee(Math.max((f.totalFee || 0) - (f.finalFee || 0), 0))})
                </td>
                <td className="py-3 text-emerald-400">₹{formatRupee(f.amountPaid)}</td>
                <td className="py-3 text-amber-400">₹{formatRupee(f.remainingFee)}</td>
                <td className="py-3">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      f.remainingFee <= 0
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {f.remainingFee <= 0 ? "Paid" : "Pending"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
