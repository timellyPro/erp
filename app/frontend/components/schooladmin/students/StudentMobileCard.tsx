"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import { AVATAR_URL } from "../../../constants/images";
import { StudentRow } from "./types";
import { getAge } from "./utils";

const getResidencyLabel = (value?: string) => {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized.includes("host")) return "Hosteller";
  if (normalized.includes("day")) return "Day Scholar";
  return value || "-";
};

type Props = {
  student: StudentRow;
  index: number;
  onView: (student: StudentRow) => void;
  onEdit: (student: StudentRow) => void;
  onDelete: (student: StudentRow) => void;
};

export default function StudentMobileCard({
  student,
  index,
  onView,
  onEdit,
  onDelete,
}: Props) {
  const name = student.user?.name || student.name || "Student";
  const photoUrl = student.user?.photoUrl || student.photoUrl || AVATAR_URL;
  const studentId = student.rollNo || student.admissionNumber || student.id.slice(0, 6).toUpperCase();
  const classLabel = student.class?.name
    ? `${student.class.name}${student.class.section ? `-${student.class.section}` : ""}`
    : "-";

  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg animate-fadeIn"
    >
      <div className="flex items-center gap-3">
        <img
          src={photoUrl}
          alt={name}
          className="h-12 w-12 rounded-2xl object-cover border border-white/10"
        />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{name}</div>
          <div className="text-xs text-white/50">{studentId}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
              {classLabel}
            </span>
            <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-2.5 py-1 text-[11px] font-semibold text-lime-300">
              {student.status || "Active"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] text-white/50">Gender</div>
          <div className="text-sm font-semibold text-white">
            {student.gender || "-"}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] text-white/50">Age</div>
          <div className="text-sm font-semibold text-white">
            {getAge(student.dob)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 col-span-2">
          <div className="text-[11px] text-white/50">Type</div>
          <div className="text-sm font-semibold text-white">
            {getResidencyLabel(student.residencyType)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => onView(student)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
        >
          <Eye size={14} /> View
        </button>
        <button
          onClick={() => onEdit(student)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-3 py-2 text-xs font-semibold text-black hover:bg-lime-300"
        >
          <Pencil size={14} /> Edit
        </button>
        <button
          onClick={() => onDelete(student)}
          className="inline-flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
