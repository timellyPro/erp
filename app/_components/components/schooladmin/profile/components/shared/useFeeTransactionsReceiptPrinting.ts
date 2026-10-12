import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { FeePaymentReceiptData } from "../../../../pdf/FeePaymentReceiptTemplate";
import { printFromElement } from "@/lib/pdfUtils";
import { formatReceiptGeneratedDate } from "@/lib/fees/receiptDates";
import type { TransactionDisplayRow } from "./feeTransactionsTypes";
import { buildReceiptDataFromTransactionRows as buildReceiptData } from "./feeReceiptBuilder";

export function useFeeTransactionsReceiptPrinting({
  studentId = "",
  transactionRows,
  schoolBrand,
  studentName = "Student",
  admissionNumber = "",
  classDisplayName = "-",
  residencyType = "Day Scholar",
  parentName = "-",
  parentPhone = "-",
  motherName = "-",
  autoPrintPaymentId = null,
  transactionsLoading = false,
  onAutoPrintDone,
}: {
  studentId?: string;
  transactionRows: TransactionDisplayRow[];
  schoolBrand: { name: string; address: string; logo: string | null };
  studentName?: string;
  admissionNumber?: string;
  classDisplayName?: string;
  residencyType?: string;
  parentName?: string;
  parentPhone?: string;
  motherName?: string;
  autoPrintPaymentId?: string | null;
  transactionsLoading?: boolean;
  onAutoPrintDone?: () => void;
}) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [receiptData, setReceiptData] = useState<FeePaymentReceiptData | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);
  const autoPrintStartedRef = useRef<string | null>(null);

  const buildReceiptDataFromTransactionRows = (
    selectedRows: TransactionDisplayRow[],
    transactionDate: string,
    generatedOn: string
  ) =>
    buildReceiptData(selectedRows, transactionDate, generatedOn, {
      schoolBrand,
      studentName,
      admissionNumber,
      classDisplayName,
      parentName,
      motherName,
      residencyType,
      parentPhone,
    });

  const handlePrintReceipt = async (row: TransactionDisplayRow) => {
    if (!studentId.trim()) {
      alert("Missing student. Reload the page and try again.");
      return;
    }
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const data = buildReceiptDataFromTransactionRows([row], row.createdAt, generatedOn);

    setPrintingId(row.rowKey);
    flushSync(() => {
      setReceiptData(data);
    });

    try {
      await printFromElement(receiptRef, { minHeight: 400 });
    } catch (error) {
      console.error("Error printing receipt:", error);
      alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
    } finally {
      setPrintingId(null);
      setReceiptData(null);
    }
  };

  useEffect(() => {
    if (!autoPrintPaymentId || transactionsLoading) return;
    if (autoPrintStartedRef.current === autoPrintPaymentId) return;
    const rowsForPayment = transactionRows.filter((r) => r.paymentId === autoPrintPaymentId);
    if (rowsForPayment.length === 0) return;

    autoPrintStartedRef.current = autoPrintPaymentId;
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const transactionDate = rowsForPayment[0]?.createdAt ?? new Date().toISOString();
    const data = buildReceiptDataFromTransactionRows(rowsForPayment, transactionDate, generatedOn);

    void (async () => {
      setPrintingId(autoPrintPaymentId);
      flushSync(() => {
        setReceiptData(data);
      });
      try {
        await printFromElement(receiptRef, { minHeight: 400 });
      } catch (error) {
        console.error("Error printing receipt:", error);
        alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
      } finally {
        setPrintingId(null);
        setReceiptData(null);
        onAutoPrintDone?.();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-print fires once per autoPrintPaymentId; the builder is recreated each render
  }, [autoPrintPaymentId, onAutoPrintDone, transactionRows, transactionsLoading]);

  const toggleReceiptSelection = (id: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const printSelectedReceipts = async () => {
    const selectedRows = transactionRows.filter((r) => selectedReceiptIds.includes(r.rowKey));
    if (selectedRows.length === 0) {
      alert("Select at least one transaction to print.");
      return;
    }
    const latestTxDate = selectedRows.reduce((max, row) => {
      const t = new Date(row.createdAt).getTime();
      return t > max ? t : max;
    }, 0);
    const transactionDate =
      latestTxDate > 0 ? new Date(latestTxDate).toISOString() : new Date().toISOString();
    const generatedOn = formatReceiptGeneratedDate(new Date());
    const data = buildReceiptDataFromTransactionRows(selectedRows, transactionDate, generatedOn);
    setPrintingId("bulk");
    flushSync(() => {
      setReceiptData(data);
    });
    try {
      await printFromElement(receiptRef, { minHeight: 400 });
    } catch (error) {
      console.error("Error printing receipt:", error);
      alert(error instanceof Error ? error.message : "Failed to print receipt. Please try again.");
    } finally {
      setPrintingId(null);
      setReceiptData(null);
    }
  };

  return {
    receiptRef,
    receiptData,
    printingId,
    selectedReceiptIds,
    handlePrintReceipt,
    toggleReceiptSelection,
    printSelectedReceipts,
  };
}
