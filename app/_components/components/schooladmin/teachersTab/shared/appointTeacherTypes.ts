export const DEFAULT_AVATAR = "https://randomuser.me/api/portraits/lego/1.jpg";

export type ClassItem = {
  id: string;
  name: string;
  section: string | null;
  teacherId: string | null;
  teacher?: {
    id: string;
    name: string | null;
    email: string | null;
    teacherId?: string | null;
    photoUrl?: string | null;
  } | null;
};

export type TeacherItem = {
  id: string;
  name: string | null;
  email: string | null;
  teacherId: string | null;
  photoUrl: string | null;
};

export type AppointmentRow = {
  classId: string;
  className: string;
  teacherName: string;
  teacherCode: string;
  teacherEmail: string;
  avatar: string;
};
