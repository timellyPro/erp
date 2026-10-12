"use client";

import { Download } from "lucide-react";
import { usePettyCashState, PettyCashForm, PettyCashTable, type FilterType } from "./shared/petty-cash";

export default function PettyCashSection() {
  const {
    loading,
    saving,
    editingId,
    form,
    setForm,
    exportOpen,
    setExportOpen,
    page,
    setPage,
    filterType,
    setFilterType,
    filterDay,
    setFilterDay,
    filterWeek,
    setFilterWeek,
    filterMonth,
    setFilterMonth,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    totalAmount,
    filteredExpenses,
    filteredTotalAmount,
    totalPages,
    paginatedExpenses,
    resetForm,
    submit,
    onEdit,
    onDelete,
    handleExport,
  } = usePettyCashState();

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <h3 className="text-lg font-semibold">Petty Cash</h3>
      <p className="mt-1 text-sm text-gray-400">
        Store school expense records with Date, Head of Account, Description, Voucher No, and Cash/Online type.
      </p>

      <PettyCashForm
        form={form}
        onFormChange={setForm}
        saving={saving}
        editingId={editingId}
        onSubmit={() => void submit()}
        onResetForm={resetForm}
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3 text-sm">
        <div>
          <span className="text-white/70">Filtered Total:</span>{" "}
          <span className="font-semibold text-white">INR {filteredTotalAmount.toLocaleString()}</span>
          <span className="mx-2 text-white/30">|</span>
          <span className="text-white/70">All Time:</span>{" "}
          <span className="font-semibold text-white">INR {totalAmount.toLocaleString()}</span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-sm text-lime-300 hover:bg-lime-500/20"
          >
            <Download size={16} />
            Export
          </button>
          {exportOpen ? (
            <div className="absolute right-0 z-20 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-white/15 bg-[#151525] shadow-xl">
              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              >
                Export as PDF
              </button>
              <button
                type="button"
                onClick={() => void handleExport("excel")}
                className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              >
                Export as Excel
              </button>
              <button
                type="button"
                onClick={() => void handleExport("csv")}
                className="block w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              >
                Export as CSV
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/10 p-3 md:grid-cols-5">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as FilterType)}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
        >
          <option value="ALL">All</option>
          <option value="DAY">Day</option>
          <option value="WEEK">Week</option>
          <option value="MONTH">Month</option>
          <option value="RANGE">Date Range</option>
        </select>
        {filterType === "DAY" ? (
          <input
            type="date"
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        ) : null}
        {filterType === "WEEK" ? (
          <input
            type="week"
            value={filterWeek}
            onChange={(e) => setFilterWeek(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        ) : null}
        {filterType === "MONTH" ? (
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          />
        ) : null}
        {filterType === "RANGE" ? (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
          </>
        ) : null}
        <div className="flex items-center justify-end text-xs text-white/60 md:col-span-2">
          Showing {filteredExpenses.length} record(s)
        </div>
      </div>

      <PettyCashTable
        loading={loading}
        filteredExpenses={filteredExpenses}
        paginatedExpenses={paginatedExpenses}
        onEdit={onEdit}
        onDelete={(row) => void onDelete(row)}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </section>
  );
}
