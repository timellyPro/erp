import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";

export type HeadCard = {
  key: string;
  sourceKey?: string;
  label: string;
  amount: number;
  gross?: number;
  paid: number;
  due: number;
  extraFeeId?: string;
  canDeleteExtra?: boolean;
  extraFeeFullAmount?: number;
  extraFeeNameForEdit?: string;
  splitIntoTwoInstallments?: boolean;
  headType?: string;
};

export function baseComponentIndexFromHead(head: {
  key: string;
  sourceKey?: string;
  extraFeeId?: string;
}): number | null {
  if (head.extraFeeId) return null;
  const sk = head.sourceKey ?? head.key;
  if (!sk.startsWith("BASE:")) return null;
  const rest = sk.slice("BASE:".length);
  const idxPart = rest.split("::")[0];
  const n = Number(idxPart);
  return Number.isFinite(n) ? n : null;
}

export type DiscountApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type DiscountApprovalSummary = {
  id: string;
  status: DiscountApprovalStatus;
  discountFixedAmount?: number | null;
  discountFeeHeadKey?: string | null;
  discountFeeHeadLabel?: string | null;
  discountRemarks?: string | null;
  createdAt?: string;
};

export function mergeDiscountApprovals(
  current: DiscountApprovalSummary[],
  incoming: DiscountApprovalSummary[]
): DiscountApprovalSummary[] {
  const byId = new Map<string, DiscountApprovalSummary>();
  for (const approval of current) byId.set(approval.id, approval);
  for (const approval of incoming) byId.set(approval.id, approval);
  return [...byId.values()].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });
}

export type FeesBreakdownProps = {
  studentId: string;
  /** Required to edit or delete class-wide (structure) fee heads from this screen. */
  classId?: string | null;
  totalFee: number;
  baseTotalFee: number;
  discountPercent: number;
  amountPaid: number;
  remainingFee: number;
  /** Optional contextual info for PDFs */
  studentName?: string;
  admissionNumber?: string;
  classDisplayName?: string;
  schoolName?: string;
  payments?: Array<{
    id: string;
    amount: number;
    status: string;
    feeTypeName?: string;
    feeTypeAmount?: number;
    feeAllocations?: Array<{ name: string; amount: number }>;
    createdAt: string;
    collectedByName?: string | null;
    method?: string;
    gateway?: string;
  }>;
  discountFeeHeadKey?: string | null;
  discountFeeHeadLabel?: string | null;
  discountRemarks?: string | null;
  discountFixedAmount?: number | null;
  latestDiscountApproval?: DiscountApprovalSummary | null;
  discountApprovals?: DiscountApprovalSummary[];
  onFeeModified?: (paymentResult?: {
    payment: {
      id: string;
      amount: number;
      status: string;
      gateway?: string;
      createdAt: string;
      transactionId?: string | null;
    };
    updatedFee: { amountPaid: number; remainingFee: number; finalFee?: number; totalFee?: number };
    feeAllocations?: Array<{ name: string; amount: number }>;
  }) => void;
  /** Used to seed assign-from-catalog rows (hostel vs transport hint). */
  residencyType?: string | null;
  classSection?: string | null;
  /** Preloaded from details-bundle (only source — no client refetch to avoid stale overwrite). */
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  /** Parent is still loading breakdown after profile shell. */
  feeBreakdownPending?: boolean;
  /** Inactive students — block fee recording and edits. */
  feesRecordingDisabled?: boolean;
};
