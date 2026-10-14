import { IconType } from "react-icons";

export interface IMenuItem {
  label: string;
  href: string;
  icon: IconType; 
  tab?: string;
  action?: "logout";
}


type SchoolFormState = {
  schoolName: string;
  password: string;
  phone: string;
  email: string;
  classRange: string;
  board: string;
  addressLine: string;
  pincode: string;
  area: string;
  city: string;
  district: string;
  state: string;
  // SaaS config (optional) for this school decided by superadmin
  billingMode?: "PARENT_SUBSCRIPTION" | "SCHOOL_PAID";
  parentSubscriptionAmount?: string;
  parentSubscriptionTrialDays?: string;
};
export type { SchoolFormState };


export interface Teacher {
  id: string;
  name: string;
  email: string;
  mobile: string;
  subjectsTaught: string;
}

export type FieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "textarea"
  | "select"
  | "date"
  | "file";

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[]; 
  accept?: string;
}

