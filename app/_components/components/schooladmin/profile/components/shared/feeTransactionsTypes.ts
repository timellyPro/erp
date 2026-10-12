import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";

export type PaymentFeeAllocationLine = { name: string; amount: number };

export type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  collectedByName?: string | null;
  collectedByUserId?: string | null;
  feeTypeName?: string;
  feeTypeAmount?: number;
  feeAllocations?: PaymentFeeAllocationLine[];
};

/** One table row per fee head (split payments are not grouped). */
export type TransactionDisplayRow = {
  rowKey: string;
  paymentId: string;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
  transactionId: string | null;
  collectedByName: string | null;
  feeTypeName: string;
  sourcePayment: PaymentRow;
};

export type FeeTransactionsProps = {
  fee?: {
    totalFee: number;
    amountPaid: number;
    remainingFee: number;
  } | null;
  /** When present, totals prefer breakdown (matches fee head cards). */
  feeBreakdown?: AdminStudentFeeBreakdownResult | null;
  payments?: PaymentRow[];
  studentName?: string;
  studentId?: string;
  admissionNumber?: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
  studentCreatedAt?: string;
  classDisplayName?: string;
  residencyType?: string;
  parentName?: string;
  parentPhone?: string;
  motherName?: string;
  /** Refetch student detail after payment edit/delete */
  onPaymentsChanged?: () => void;
  onPaymentDeleted?: (result: {
    paymentId: string;
    updatedFee: { amountPaid: number; remainingFee: number; finalFee?: number } | null;
    feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
  }) => void;
  feesRecordingDisabled?: boolean;
  /** True while payment history is still loading from the server. */
  transactionsLoading?: boolean;
  /** After recording a payment, auto-open its receipt once rows are ready. */
  autoPrintPaymentId?: string | null;
  onAutoPrintDone?: () => void;
};
