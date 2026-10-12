export type PettyCashExpense = {
  id: string;
  voucherNo: number;
  itemName: string;
  headOfAccount?: string | null;
  paymentType?: string | null;
  amount: number;
  expenseDate: string;
  description: string | null;
  createdAt: string;
};

export type FormState = {
  headOfAccount: string;
  paymentType: "CASH" | "ONLINE";
  amount: string;
  expenseDate: string;
  description: string;
};

export type SchoolMeta = {
  name?: string;
  logoUrl?: string | null;
};

export type FilterType = "ALL" | "DAY" | "WEEK" | "MONTH" | "RANGE";
export const PAGE_SIZE = 10;

export const emptyForm: FormState = {
  headOfAccount: "",
  paymentType: "CASH",
  amount: "",
  expenseDate: "",
  description: "",
};

export const HEAD_OF_ACCOUNT_OPTIONS = [
  "Voucher",
  "Bill Cash",
  "Salary",
  "Transportation Charges",
  "Vehicle Maintenance",
  "Advances",
  "Stationary Expenses",
  "Refreshments",
  "Function Expenses",
  "Annual Maintenance Charges",
  "Fast Tag Recharge",
  "School Mobile Recharges",
  "Cheque Transfer",
];
