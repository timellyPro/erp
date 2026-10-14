export const eventTypeOptions = [
  { id: "workshop", name: "Workshop" },
  { id: "seminar", name: "Seminar" },
  { id: "competition", name: "Competition" },
  { id: "webinar", name: "Webinar" },
  { id: "event", name: "Events" },
];

export const difficultyOptions = [
  { id: "beginner", name: "Beginner" },
  { id: "intermediate", name: "Intermediate" },
  { id: "advanced", name: "Advanced" },
  { id: "alllevels", name: "All Levels" },
];

export const modeOptions = [
  { id: "offline", name: "Offline" },
  { id: "online", name: "Online" },
  { id: "hybrid", name: "Hybrid" },
];

export interface CreateEventFormProps {
  onCancel?: () => void;
  onCreated?: (event?: { id: string } | null) => void;
  initialEvent?: {
    id: string;
    title: string;
    description?: string | null;
    eventDate?: string | null;
    location?: string | null;
    mode?: string | null;
    type?: string | null;
    level?: string | null;
    additionalInfo?: string | null;
    photo?: string | null;
    maxSeats?: number | null;
    amount?: number | null;
    classId?: string | null;
  } | null;
  className?: string;
}
