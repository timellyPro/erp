export type StudentProfile = {
  student: {
    id: string;
    name: string;
    admissionNumber: string;
    email: string;
    photoUrl: string | null;
    rollNo: string;
    dob: string;
    age: number | null;
    address: string;
    phone: string;
    fatherName: string;
    motherName?: string;
    gender?: string;
    previousSchool?: string;
    status?: string;
    class: { id: string; name: string; section: string | null; displayName: string } | null;
  };
  attendanceTrends: Array<{ month: string; present: number; total: number; pct: number }>;
  academicPerformance: Array<{ subject: string; score: number }>;
  certificates: Array<{ id: string; title: string; issuedDate: string }>;
};

export type Mark = {
  id: string;
  subject: string;
  marks: number;
  totalMarks: number;
  grade?: string | null;
  examType?: string | null;
  createdAt?: string;
};
