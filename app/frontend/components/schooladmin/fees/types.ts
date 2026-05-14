export interface Class {
  id: string;
  name: string;
  section: string | null;
}

export interface Student {
  id: string;
  admissionNumber: string;
  user: { name: string | null; email: string | null };
  class: { id: string; name: string; section: string | null } | null;
}

export interface FeeSummary {
  totalStudents: number;
  paid: number;
  pending: number;
  /** Sum of base tuition (structure + extras) before discount — StudentFee.totalFee */
  totalFee: number;
  /** Sum of (totalFee − finalFee) — documented discount amount */
  totalDiscount: number;
  totalCollected: number;
  totalDue: number;
}

export interface FeeRecord {
  id: string;
  totalFee: number;
  finalFee: number;
  amountPaid: number;
  remainingFee: number;
  // Comma-separated fee head names (e.g., Tuition, Lab) that still have due.
  feeTypes?: string;
  feeTypeDueAmount?: number;
  discountPercent: number;
  student: {
    id: string;
    user: { name: string | null; email: string | null };
    class: { id: string; name: string; section: string | null } | null;
  };
}

export interface ExtraFee {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  /** ALL | HOSTELLER | DAY_SCHOLAR */
  residencyScope?: string | null;
  splitIntoTwoInstallments?: boolean;
}

export interface FeeStructure {
  id: string;
  classId: string;
  components: Array<{ name: string; amount: number }>;
  class: { id: string; name: string; section: string | null };
}
