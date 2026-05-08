"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Receipt } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import type { Class, Student } from "./types";
import SelectInput from "../../common/SelectInput";
import { printFromElement } from "@/lib/pdfUtils";

type Props = {
  classes: Class[];
  students: Student[];
  onSuccess: () => void;
};

type DueHead = {
  key: string;
  label: string;
  headType: "BASE_COMPONENT" | "EXTRA_FEE";
  dueBefore: number;
};

type VoucherRow = {
  id: string;
  voucherNo: string;
  date: string;
  studentName: string;
  admissionNo: string;
  className: string;
  paymentMode: string;
  transactionId: string;
  amount: number;
  heads: Array<{ name: string; amount: number }>;
};

type ExportType = "pdf" | "xlsx" | "csv";

const paymentModes = ["CASH", "ONLINE", "UPI", "CHEQUE", "DD", "OTHERS"];

const methodLabel = (value: string) => {
  const normalized = String(value || "").toUpperCase();
  if (!normalized) return "-";
  if (normalized === "OFFLINE" || normalized === "OFFLINE_CASH") return "Cash";
  if (normalized.includes("CASH")) return "Cash";
  if (normalized.includes("UPI")) return "UPI";
  if (normalized.includes("CHEQUE")) return "Cheque";
  if (normalized.includes("DD")) return "DD";
  if (normalized.includes("ONLINE")) return "Online";
  if (normalized.includes("BANK")) return "Bank Transfer";
  if (normalized.includes("OTHER")) return "Others";
  return value;
};

const sanitizeVoucherRef = (rawRef: string | null | undefined, rawGateway: string | null | undefined) => {
  const ref = String(rawRef || "").trim();
  const gateway = String(rawGateway || "").toUpperCase();
  if (!ref) return "-";
  if (gateway.includes("CASH")) return "-";
  if (/^OFF/i.test(ref)) return "-";
  if (/OFF[-_]/i.test(ref)) return "-";
  if (/^AUTO[-_]/i.test(ref)) return "-";
  return ref;
};

function VoucherReceiptTemplate({
  receiptRef,
  voucher,
  school,
}: {
  receiptRef: React.RefObject<HTMLDivElement | null>;
  voucher: VoucherRow | null;
  school: { name: string; address: string; logo: string | null };
}) {
  if (!voucher) return null;
  const amountInWords = `${voucher.amount.toLocaleString("en-IN")} only`;
  const safeRef = sanitizeVoucherRef(voucher.transactionId, voucher.paymentMode);
  return (
    <div style={{ position: "fixed", top: "-9999px", left: "-9999px", zIndex: -9999 }}>
      <div
        ref={receiptRef}
        style={{ width: "840px", padding: "10px", background: "#f8fafc", color: "#0f172a", fontFamily: "Inter, Arial, sans-serif" }}
      >
        <div
          style={{
            border: "2px solid #0f172a",
            borderRadius: 14,
            overflow: "hidden",
            position: "relative",
            minHeight: "520px",
            background: "#ffffff",
          }}
        >
          <div style={{ position: "absolute", inset: 0, opacity: 0.07, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {school.logo ? <img src={school.logo} alt="watermark" style={{ width: 210, height: 210, objectFit: "contain" }} /> : null}
          </div>
          <div style={{ position: "relative" }}>
            <div
              style={{
                background: "linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%)",
                color: "#ffffff",
                padding: "14px 16px",
                borderBottom: "2px solid #0f172a",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {school.logo ? <img src={school.logo} alt="logo" style={{ width: 56, height: 56, objectFit: "contain", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }} /> : null}
                  <div>
                    <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.02 }}>{school.name || "School"}</div>
                    <div style={{ fontSize: 12, opacity: 0.9, maxWidth: 560 }}>{school.address || "-"}</div>
                  </div>
                </div>
                <div style={{ minWidth: 190, display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ border: "2px solid #e2e8f0", background: "#ffffff", color: "#0f172a", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 28, letterSpacing: 0.8 }}>
                    VOUCHER
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 16px 12px" }}>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", gap: 14, fontSize: 14, fontWeight: 700 }}>
                <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "6px 10px" }}><b>Voucher No:</b> {voucher.voucherNo}</div>
                <div style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 10px" }}><b>Date:</b> {voucher.date}</div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.75 }}>
                <div><b>Received with thanks from:</b> {voucher.studentName} ({voucher.className})</div>
                <div><b>Admission No:</b> {voucher.admissionNo}</div>
                <div><b>Payment mode:</b> {voucher.paymentMode} {safeRef !== "-" ? `| Ref: ${safeRef}` : ""}</div>
                <div><b>The sum of Rupees:</b> Rs. {amountInWords}</div>
              </div>
            </div>
            <table style={{ width: "calc(100% - 32px)", margin: "0 16px", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#e2e8f0" }}>
                  <th style={{ border: "1px solid #0f172a", padding: "7px", textAlign: "left" }}>Fee Head</th>
                  <th style={{ border: "1px solid #0f172a", padding: "7px", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {voucher.heads.map((head, index) => (
                  <tr key={`${head.name}-${index}`} style={{ background: index % 2 ? "#f8fafc" : "#ffffff" }}>
                    <td style={{ border: "1px solid #334155", padding: "7px" }}>{head.name}</td>
                    <td style={{ border: "1px solid #334155", padding: "7px", textAlign: "right", fontWeight: 600 }}>₹{head.amount.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#dbeafe" }}>
                  <td style={{ border: "1px solid #0f172a", padding: "8px", fontWeight: 800 }}>Total</td>
                  <td style={{ border: "1px solid #0f172a", padding: "8px", textAlign: "right", fontWeight: 800 }}>₹{voucher.amount.toLocaleString("en-IN")}</td>
                </tr>
              </tfoot>
            </table>
            <div style={{ marginTop: 72, padding: "0 16px", display: "flex", justifyContent: "space-between", fontSize: 13, color: "#1e293b" }}>
              <div style={{ fontWeight: 600 }}>Accountant</div>
              <div style={{ minWidth: 165, textAlign: "center", borderTop: "1.5px solid #0f172a", paddingTop: 4, fontWeight: 600 }}>Authorised Signature</div>
            </div>
            <div style={{ padding: "8px 16px 12px", textAlign: "center", fontSize: 11, color: "#475569" }}>Powered by Timelly</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VoucherSection({ classes, students, onSuccess }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [studentId, setStudentId] = useState("");
  const [heads, setHeads] = useState<DueHead[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [mode, setMode] = useState("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [loadingHeads, setLoadingHeads] = useState(false);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [exportType, setExportType] = useState<ExportType>("pdf");
  const [receiptVoucher, setReceiptVoucher] = useState<VoucherRow | null>(null);
  const [school, setSchool] = useState({ name: "School", address: "-", logo: null as string | null });

  const sections = useMemo(() => {
    if (!selectedClass) return [];
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.class?.id === selectedClass && s.class?.section) set.add(s.class.section);
    });
    return Array.from(set);
  }, [selectedClass, students]);

  const filteredStudents = useMemo(
    () =>
      students.filter((s) => {
        if (selectedClass && s.class?.id !== selectedClass) return false;
        if (selectedSection && s.class?.section !== selectedSection) return false;
        return true;
      }),
    [students, selectedClass, selectedSection]
  );

  const totalAmount = useMemo(
    () =>
      Object.values(allocations).reduce((sum, value) => {
        const n = Number(value);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0),
    [allocations]
  );

  const loadSchool = async () => {
    const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const name = data?.school?.name || "School";
    const address = [data?.school?.address, data?.school?.location].filter(Boolean).join(", ") || "-";
    const logo = typeof data?.school?.logoUrl === "string" ? data.school.logoUrl : null;
    setSchool({ name, address, logo });
  };

  const loadVouchers = async () => {
    setLoadingVouchers(true);
    try {
      const res = await fetch("/api/fees/transactions?limit=400", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
      const normalized: VoucherRow[] = transactions
        .filter((t: any) => String(t.gateway || "").toUpperCase().includes("OFFLINE_VOUCHER_"))
        .map((t: any, idx: number) => ({
          id: t.id,
          voucherNo: String(idx + 1),
          date: new Date(t.createdAt).toISOString().slice(0, 10),
          studentName: t.student?.user?.name || "-",
          admissionNo: t.student?.admissionNumber || "-",
          className: t.student?.class ? `${t.student.class.name}${t.student.class.section ? `-${t.student.class.section}` : ""}` : "-",
          paymentMode: methodLabel(t.gateway),
          transactionId: sanitizeVoucherRef(t.transactionId ?? t.hyperpgTxnId, t.gateway),
          amount: Number(t.amount) || 0,
          heads: Array.isArray(t.feeAllocations) && t.feeAllocations.length
            ? t.feeAllocations.map((h: any) => ({ name: h.name || "Fee", amount: Number(h.amount) || 0 }))
            : [{ name: t.feeTypeName || "Fee", amount: Number(t.amount) || 0 }],
        }));
      setVouchers(normalized);
    } finally {
      setLoadingVouchers(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await Promise.all([loadSchool(), loadVouchers()]);
    })();
  }, []);

  useEffect(() => {
    if (!studentId) {
      setHeads([]);
      setAllocations({});
      return;
    }
    setLoadingHeads(true);
    void (async () => {
      try {
        const res = await fetch(`/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Failed to load due heads");
        const dueHeads: DueHead[] = Array.isArray(data?.dueHeads)
          ? data.dueHeads.map((h: any) => ({
              key: h.key,
              label: h.label || h.key,
              headType: h.headType,
              dueBefore: Number(h.dueBefore) || 0,
            }))
          : [];
        setHeads(dueHeads.filter((h) => h.dueBefore > 0));
        setAllocations({});
      } catch (e: any) {
        alert(e?.message || "Failed to load due heads");
      } finally {
        setLoadingHeads(false);
      }
    })();
  }, [studentId]);

  const submitVoucher = async () => {
    const explicitAllocations = heads
      .map((head) => ({ key: head.key, amount: Number(allocations[head.key] || 0) }))
      .filter((a) => Number.isFinite(a.amount) && a.amount > 0);
    if (!studentId) return alert("Select student");
    if (explicitAllocations.length === 0) return alert("Enter at least one fee head amount");
    const invalid = explicitAllocations.find((a) => a.amount > (heads.find((h) => h.key === a.key)?.dueBefore || 0) + 0.01);
    if (invalid) return alert("One head amount exceeds due");
    if (mode !== "CASH" && !referenceNo.trim()) return alert("Reference / UTR required for non-cash payment");

    const selectedHeads = explicitAllocations.map((a) => {
      if (a.key.startsWith("BASE:")) {
        const componentIndex = Number(a.key.slice("BASE:".length));
        const label = heads.find((h) => h.key === a.key)?.label || "Fee";
        return { headType: "BASE_COMPONENT", componentIndex, componentName: label };
      }
      return { headType: "EXTRA_FEE", extraFeeId: a.key.slice("EXTRA:".length) };
    });

    setSaving(true);
    try {
      const res = await fetch("/api/fees/offline-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId,
          amount: totalAmount,
          paymentMode: `OFFLINE_VOUCHER_${mode}`,
          refNo: referenceNo.trim() || undefined,
          transactionId: referenceNo.trim() || undefined,
          paymentDate,
          selectedHeads,
          explicitAllocations,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to save voucher");
      await loadVouchers();
      onSuccess();
      setSelectedClass("");
      setSelectedSection("");
      setStudentId("");
      setHeads([]);
      setAllocations({});
      setReferenceNo("");
      setMode("CASH");
      alert("Voucher saved");
    } catch (e: any) {
      alert(e?.message || "Failed to save voucher");
    } finally {
      setSaving(false);
    }
  };

  const exportRows = vouchers.map((v) => ({
    "Voucher No": v.voucherNo,
    Date: v.date,
    Student: v.studentName,
    "Admission No": v.admissionNo,
    Class: v.className,
    Heads: v.heads.map((h) => h.name).join(", "),
    "Payment Mode": v.paymentMode,
    "Ref / UTR": v.transactionId,
    Amount: v.amount,
  }));

  const exportData = async () => {
    if (!exportRows.length) return alert("No vouchers to export");
    const name = `vouchers-${new Date().toISOString().slice(0, 10)}`;
    if (exportType === "xlsx") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), "Vouchers");
      XLSX.writeFile(wb, `${name}.xlsx`);
      return;
    }
    if (exportType === "csv") {
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text(school.name || "School", 148, 12, { align: "center" });
    doc.setFontSize(10);
    doc.text(school.address || "-", 148, 18, { align: "center" });
    doc.setFontSize(12);
    doc.text("Voucher Register", 148, 25, { align: "center" });
    let y = 34;
    doc.setFontSize(8.5);
    doc.text("Voucher", 10, y);
    doc.text("Date", 34, y);
    doc.text("Student", 56, y);
    doc.text("Class", 115, y);
    doc.text("Mode", 142, y);
    doc.text("Ref", 166, y);
    doc.text("Amount", 285, y, { align: "right" });
    y += 5;
    vouchers.forEach((v) => {
      if (y > 200) {
        doc.addPage();
        y = 18;
      }
      doc.text(v.voucherNo, 10, y);
      doc.text(v.date, 34, y);
      doc.text(v.studentName.slice(0, 28), 56, y);
      doc.text(v.className, 115, y);
      doc.text(v.paymentMode, 142, y);
      doc.text(v.transactionId.slice(0, 26), 166, y);
      doc.text(v.amount.toLocaleString("en-IN"), 285, y, { align: "right" });
      y += 5;
    });
    doc.save(`${name}.pdf`);
  };

  const printVoucher = async (voucher: VoucherRow) => {
    setReceiptVoucher(voucher);
    setTimeout(async () => {
      await printFromElement(receiptRef);
      setReceiptVoucher(null);
    }, 300);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Voucher Entry</h3>
        <p className="text-sm text-white/60">Create payment voucher, reduce fee heads, print receipt, and export voucher register.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SelectInput value={selectedClass} onChange={(v) => { setSelectedClass(v); setSelectedSection(""); setStudentId(""); }} options={[{ label: "Select class", value: "" }, ...classes.map((c) => ({ label: `${c.name}${c.section ? `-${c.section}` : ""}`, value: c.id }))]} />
        <SelectInput value={selectedSection} onChange={(v) => { setSelectedSection(v); setStudentId(""); }} disabled={!selectedClass} options={[{ label: "All sections", value: "" }, ...sections.map((s) => ({ label: s, value: s }))]} />
        <SelectInput value={studentId} onChange={setStudentId} options={[{ label: "Select student", value: "" }, ...filteredStudents.map((s) => ({ label: `${s.user.name || "-"} (${s.admissionNumber || "-"})`, value: s.id }))]} />
        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white" />
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-2 border-b border-white/10 text-sm font-medium">Voucher Heads</div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-white/70">
              <tr>
                <th className="px-3 py-2">Head</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Pay now</th>
              </tr>
            </thead>
            <tbody>
              {loadingHeads ? (
                <tr><td colSpan={3} className="px-3 py-3 text-white/60">Loading heads...</td></tr>
              ) : heads.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-3 text-white/60">Select student to load due heads.</td></tr>
              ) : heads.map((h) => (
                <tr key={h.key} className="border-t border-white/5">
                  <td className="px-3 py-2">{h.label}</td>
                  <td className="px-3 py-2">₹{h.dueBefore.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={h.dueBefore}
                      step="0.01"
                      value={allocations[h.key] || ""}
                      onChange={(e) => setAllocations((prev) => ({ ...prev, [h.key]: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SelectInput value={mode} onChange={setMode} options={paymentModes.map((m) => ({ label: methodLabel(m), value: m }))} />
        <input
          type="text"
          value={referenceNo}
          onChange={(e) => setReferenceNo(e.target.value)}
          placeholder={mode === "CASH" ? "Reference optional for cash" : "Reference / UTR"}
          className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white md:col-span-2"
        />
        <button onClick={submitVoucher} disabled={saving} className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50">
          {saving ? "Saving..." : `Save Voucher (₹${totalAmount.toLocaleString("en-IN")})`}
        </button>
      </div>

      <div className="rounded-xl border border-white/10 p-3">
        <div className="mb-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <h4 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4" /> Voucher Register</h4>
          <div className="flex gap-2">
            <SelectInput value={exportType} onChange={(v) => setExportType(v as ExportType)} options={[{ label: "PDF", value: "pdf" }, { label: "Excel", value: "xlsx" }, { label: "CSV", value: "csv" }]} />
            <button onClick={exportData} className="inline-flex items-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2 text-sm text-lime-300 hover:bg-lime-500/20">
              <Download size={16} /> Export
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[30%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-white/10 text-white/70">
                <th className="py-2 pr-2 text-left">Voucher No</th>
                <th className="py-2 pr-2 text-left">Date</th>
                <th className="py-2 pr-2 text-left">Student</th>
                <th className="py-2 pr-2 text-left">Class</th>
                <th className="py-2 pr-3 text-left">Heads</th>
                <th className="py-2 pr-2 text-left">Mode</th>
                <th className="py-2 pr-2 text-right">Amount</th>
                <th className="py-2 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loadingVouchers ? (
                <tr><td colSpan={8} className="py-3 text-white/60">Loading vouchers...</td></tr>
              ) : vouchers.length === 0 ? (
                <tr><td colSpan={8} className="py-3 text-white/60">No vouchers found.</td></tr>
              ) : vouchers.map((v) => (
                <tr key={v.id} className="border-b border-white/5 align-top">
                  <td className="py-2 pr-2 whitespace-nowrap">{v.voucherNo}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{v.date}</td>
                  <td className="py-2 pr-2 break-words">{v.studentName}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{v.className}</td>
                  <td className="py-2 pr-3 break-words leading-5">{v.heads.map((h) => h.name).join(", ")}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{v.paymentMode}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">₹{v.amount.toLocaleString("en-IN")}</td>
                  <td className="py-2 text-center">
                    <button onClick={() => void printVoucher(v)} className="inline-flex items-center gap-1 rounded-lg bg-blue-500/20 px-2.5 py-1.5 text-xs text-blue-200 hover:bg-blue-500/30">
                      <Printer size={13} /> Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <VoucherReceiptTemplate receiptRef={receiptRef} voucher={receiptVoucher} school={school} />
    </section>
  );
}
