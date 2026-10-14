import type { IUser } from "@/app/_components/constants/addUserTable";

export interface UserFormData {
  name: string;
  email: string;
  role: "SCHOOLADMIN" | "TEACHER" | "STUDENT";
  designation?: string;
  password?: string;
  confirmPassword?: string;
  allowedFeatures: string[];
  // Teacher-specific
  teacherId?: string;
  subjects?: string[];
  assignedClassIds?: string[];
  qualification?: string;
  experience?: string;
  joiningDate?: string;
  teacherStatus?: string;
  mobile?: string;
  address?: string;
}

export interface UserFormProps {
  mode?: "create" | "edit";
  schoolId?: string | null;
  /** Row from list — instant shell while full user loads */
  listShellUser?: IUser | null;
  initialData?: UserFormData & { id?: string };
  onSuccess?: () => void;
}
