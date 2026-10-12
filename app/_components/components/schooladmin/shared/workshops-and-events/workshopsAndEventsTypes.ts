export interface EventItem {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  location?: string | null;
  mode?: string | null;
  additionalInfo?: string | null;
  teacher?: { name?: string | null } | null;
  photo?: string | null;
  maxSeats?: number | null;
  _count?: { registrations: number };
  type?: string | null;
  level?: string | null;
  class?: { id: string; name: string; section?: string | null } | null;
  teacherId?: string | null;
  schoolId?: string | null;
}
