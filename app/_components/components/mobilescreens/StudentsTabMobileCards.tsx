"use client";

import { Trash2 } from "lucide-react";

type StudentSummary = {
  rollNo?: string | null;
  phoneNo?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

export default function StudentMobileCard({
  student,
  index,
}: {
  student: StudentSummary;
  index: number;
}) {
  return (
    <div
      style={{ animationDelay: `${index * 80}ms` }}
      className="
        bg-white
        rounded-xl
        border
        border-gray-200
        p-4
        shadow-sm
        space-y-2
        animate-slide-in-left
      "
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs text-gray-500">Roll No</p>
          <p className="font-medium">{student.rollNo || "-"}</p>
        </div>

        <Trash2
          size={18}
          className="text-gray-400 hover:text-red-500 cursor-pointer"
        />
      </div>

      <div>
        <p className="text-xs text-gray-500">Name</p>
        <p className="font-medium">{student.user?.name || "-"}</p>
      </div>

      <div>
        <p className="text-xs text-gray-500">Email</p>
        <p className="text-sm">{student.user?.email || "-"}</p>
      </div>

      <div>
        <p className="text-xs text-gray-500">Parent Contact</p>
        <p className="text-sm">{student.phoneNo || "-"}</p>
      </div>
    </div>
  );
}
