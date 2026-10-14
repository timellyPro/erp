import { Pencil, Trash2 } from "lucide-react";
import { DEFAULT_AVATAR, type AppointmentRow } from "./appointTeacherTypes";

export function AppointTeacherTable({
  appointments,
  removingId,
  onEdit,
  onRemove,
}: {
  appointments: AppointmentRow[];
  removingId: string | null;
  onEdit: (item: AppointmentRow) => void;
  onRemove: (classId: string) => void;
}) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <div className="min-w-[600px] p-4 sm:p-6">
        <table className="w-full text-sm">
          <thead className="text-gray-400">
            <tr>
              <th className="text-left py-2">Class</th>
              <th className="text-left py-2">Teacher</th>
              <th className="text-left py-2">Email</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {appointments.map((item) => (
              <tr key={item.classId} className="border-t border-white/10">
                <td className="py-3">{item.className}</td>

                <td className="py-3 flex items-center gap-2">
                  <img
                    src={item.avatar} alt={item.teacherName}
                    className="w-7 h-7 rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_AVATAR;
                    }}
                  />
                  {item.teacherName}
                </td>

                <td className="py-3 text-white/60">
                  {item.teacherEmail}
                </td>

                <td className="py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => onEdit(item)}>
                      <Pencil
                        size={16}
                        className="text-lime-400 hover:text-lime-300"
                      />
                    </button>

                    <button
                      disabled={removingId === item.classId}
                      onClick={() => onRemove(item.classId)}
                    >
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
