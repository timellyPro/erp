export type StudentApplicationSummary = {
  id: string;
  createdAt: string;
  admissionNo?: string | null;
  fedenaNo?: string | null;
  workflowStatus?: string | null;
};

export interface IStudent {
  id: string;
  userId: string;
  createdAt?: string;
  application?: StudentApplicationSummary | null;
  adhaarNumber?: string;
  aadhaarNo?: string;
  fatherName?: string;
  motherName?: string;
  occupation?: string;
  address?: string;
  admissionNumber?: string;
  gender?: string;
  residencyType?: string;
  previousSchool?: string;
  status?: string;
  photoUrl?: string | null;
  class?: { id: string; name: string; section: string } | null;
  dob: string;
  name: string;
  email: string;
  rollNo: string;
  penNumber?: string;
  apaarId?: string;
  phoneNo: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
  subjects?: string[];
  user?: { email: string; name: string; id: string; photoUrl?: string | null };
}
