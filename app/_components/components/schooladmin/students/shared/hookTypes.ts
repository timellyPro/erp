import { ClassItem, StudentRow } from "../types";

export type Props = {
  classes?: ClassItem[];
  reload?: () => void;
};

export type ClassesListResponse = {
  classes: ClassItem[];
};

export type StudentsListResponse = {
  students: StudentRow[];
};

export type UploadFailedRow = {
  row?: number;
  error?: string;
};

export type UploadResult = {
  createdCount?: number;
  failedCount?: number;
  failed?: UploadFailedRow[];
};

export type StatusFilter = "active" | "inactive" | "all";
