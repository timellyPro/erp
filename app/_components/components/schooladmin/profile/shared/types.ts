export type StudentDetail = {
  student: {
    id: string;
    name: string;
    schoolName: string;
    admissionNumber: string;
    email: string;
    photoUrl?: string | null;
    rollNo: string;
    age: number | null;
    dob?: string;
    address: string;
    phone: string;
    fatherName: string;
    motherName?: string;
    fatherPhone?: string;
    motherPhone?: string;
    residencyType?: string;
    gender?: string;
    class: { id: string; name: string; section: string | null; displayName: string } | null;
    applicationFee: number | null;
    admissionFee: number | null;
    createdAt?: string;
    status?: string;
  };
  fee: {
    baseTotalFee: number;
    discountPercent: number;
    discountFixedAmount?: number | null;
    totalFee: number;
    amountPaid: number;
    remainingFee: number;
    tuitionPaid?: number;
    moneyForStudent: number | null;
    discountFeeHeadKey?: string | null;
    discountFeeHeadLabel?: string | null;
    discountRemarks?: string | null;
    discountApprovals?: Array<{
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      discountFixedAmount?: number | null;
      discountFeeHeadLabel?: string | null;
      discountRemarks?: string | null;
      createdAt?: string;
    }>;
  } | null;
  payments: Array<{
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
    feeAllocations?: Array<{ name: string; amount: number }>;
  }>;
  attendanceTrends: Array<{ month: string; present: number; total: number; pct: number }>;
  academicPerformance: Array<{ subject: string; score: number }>;
  certificates: Array<{
    id: string;
    title: string;
    issuedDate: string;
    issuedBy: string | null;
    certificateUrl: string | null;
  }>;
};

export type StudentOption = {
  id: string;
  name: string;
  admissionNumber: string;
  parentName: string;
  classDisplay: string;
  classId: string;
  section: string | null;
  status?: string;
  rollNo?: string | null;
  penNumber?: string | null;
  apaarId?: string | null;
};

export type FeePaymentSuccess = {
  payment: {
    id: string;
    amount: number;
    status: string;
    gateway?: string;
    createdAt: string;
    transactionId?: string | null;
    collectedByName?: string | null;
    collectedByUserId?: string | null;
  };
  updatedFee: {
    amountPaid: number;
    remainingFee: number;
    finalFee?: number;
    totalFee?: number;
  };
  feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
};

export type FeeDeleteSuccess = {
  paymentId: string;
  updatedFee: {
    amountPaid: number;
    remainingFee: number;
    finalFee?: number;
  } | null;
  feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
};
