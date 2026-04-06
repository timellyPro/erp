
export interface IStudent {
  id: string;
  userId: string;
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
  phoneNo: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
  user?: { email: string; name: string; id: string; photoUrl?: string | null };
}
