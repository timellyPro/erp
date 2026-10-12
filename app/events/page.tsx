import RequireRole from "@/app/_components/auth/RequiredRoles";
import WorkshopsAndEventsTab from "@/app/_components/components/schooladmin/workshopsandevents";

export default function EventsPages() {
  return (
    <RequireRole allowedRoles={["TEACHER", "SCHOOLADMIN"]}>
      <WorkshopsAndEventsTab />
    </RequireRole>
  );
}
