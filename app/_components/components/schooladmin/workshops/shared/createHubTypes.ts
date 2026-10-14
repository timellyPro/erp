export interface HubStudent {
  id: string;
  name: string | null;
  email?: string | null;
  class?: string | null;
}

export interface HubEvent {
  id: string;
  title: string;
  eventDate?: string | null;
  _count?: { registrations: number };
}

export function formatDate(dateString?: string | null) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
