"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import { Column } from "../../../types/superadmin";
import { AVATAR_URL } from "../../../constants/images";
import { StudentRow } from "./types";
import { getAge } from "./utils";
import { formatResidencyTypeForDisplay } from "@/lib/residencyDisplay";

const getResidencyLabel = (value?: string) => {
  const raw = (value || "").trim();
  if (!raw) return "-";
  return formatResidencyTypeForDisplay(raw);
};

type Actions = {
  onView: (student: StudentRow) => void;
  onEdit: (student: StudentRow) => void;
  onDelete: (student: StudentRow) => void;
};

export const buildStudentColumns = ({
  onView,
  onEdit,
  onDelete,
}: Actions): Column<StudentRow>[] => [
  {
    header: "Student ID",
    render: (row) => (
      <span className="text-sm font-medium text-gray-200">
        {row.rollNo || row.id.slice(0, 6).toUpperCase()}
      </span>
    ),
  },
  {
    header: "Name",
    render: (row) => {
      const name = row.user?.name || row.name || "Student";
      const email = row.user?.email || row.email || "";
      const photoUrl = row.user?.photoUrl || row.photoUrl || "";
      return (
        <div className="flex items-center gap-3">
          <img
            src={photoUrl || AVATAR_URL}
            alt={name}
            className="w-10 h-10 rounded-lg object-cover border border-white/10"
          />
          <div>
            <div className="text-sm font-medium text-gray-200 block">{name}</div>
            <div className="text-xs text-gray-500">{email || "-"}</div>
          </div>
        </div>
      );
    },
  },
  {
    header: "Gender",
    render: (row) => <span className="text-sm text-gray-300">{row.gender || "-"}</span>,
    hideOnMobile: true,
  },
  {
    header: "Age",
    render: (row) => <span className="text-sm text-gray-300">{getAge(row.dob)}</span>,
    hideOnMobile: true,
  },
  {
    header: "Class",
    render: (row) => (
      <span className="px-3 py-1 bg-white/5 text-gray-300 rounded-full
       text-xs font-semibold border border-white/10">
        {row.class?.name || "-"}
        {row.class?.section ? `-${row.class.section}` : ""}
      </span>
    ),
  },
  {
    header: "Type",
    render: (row) => (
      <span className="text-sm text-gray-300">{getResidencyLabel(row.residencyType)}</span>
    ),
    hideOnMobile: true,
  },
  {
    header: "Status",
    render: (row) => {
      const status = row.status || "Active";
      const isInactive = status === "Inactive";
      return (
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            isInactive
              ? "bg-red-400/10 text-red-400 border-red-400/20"
              : "bg-lime-400/10 text-lime-400 border-lime-400/20 shadow-[0_0_8px_rgba(163,230,53,0.2)]"
          }`}
        >
          {status}
        </span>
      );
    },
  },
  {
    header: "Actions",
    align: "right",
    render: (row) => (
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => onView(row)}
          className="p-2 hover:bg-white/10 rounded-lg transition-all"
        >
          <Eye size={16} className="lucide lucide-eye w-4 h-4 text-gray-400"/>
        </button>
        <button
          onClick={() => onEdit(row)}
          className="p-2 rounded-lg transition-all hover:bg-lime-400/10 text-lime-400"
        >
          <Pencil size={16} className="lucide lucide-square-pen w-4 h-4"/>
        </button>
        <button
          onClick={() => onDelete(row)}
          className="p-2 hover:bg-red-400/10 rounded-lg transition-all"
        >
          <Trash2 size={16} className="lucide lucide-trash2 lucide-trash-2 w-4 h-4 text-red-400"/>
        </button>
      </div>
    ),
  },
];
