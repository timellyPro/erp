"use client";

import { X } from "lucide-react";
import { StudentRow } from "./types";
import { getAge } from "./utils";
import { AVATAR_URL } from "../../../constants/images";

type Props = {
  student: StudentRow;
  onClose: () => void;
  onEdit: () => void;
};

export default function StudentDetailsModal({ student, onClose, onEdit }: Props) {
  const name = student.user?.name || student.name || "Student";
  const email = student.user?.email || student.email || "-";
  const photoUrl = student.user?.photoUrl || student.photoUrl || AVATAR_URL;
  const className = student.class?.name || "-";
  const sectionName = student.class?.section || "-";
  const studentId = student.rollNo || student.admissionNumber || student.id.slice(0, 6).toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn p-4">
      <div className="bg-[#0F172A] rounded-2xl shadow-2xl max-w-2xl w-full animate-scaleIn border border-white/10 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="sticky top-0 bg-[#0F172A] px-4 md:px-6 py-4 md:py-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-gray-100">Student Details</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-5">
          <div className="flex items-center gap-4 pb-4 border-b border-white/10">
            <img
              src={photoUrl}
              alt={name}
              className="h-14 w-14 rounded-2xl object-cover border border-white/10"
            />
            <div>
              <div className="text-lg font-bold text-gray-100">{name}</div>
              <div className="text-sm text-gray-400">{studentId}</div>
              <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold border mt-2 bg-lime-400/10 text-lime-400 border-lime-400/20">
                {student.status || "Active"}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm text-white/60 mb-3">Academic Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Class</p>
                <p className="text-sm font-semibold text-gray-200">{className}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Section</p>
                <p className="text-sm font-semibold text-gray-200">{sectionName}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Gender</p>
                <p className="text-sm font-semibold text-gray-200">{student.gender || "-"}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Age</p>
                <p className="text-sm font-semibold text-gray-200">{getAge(student.dob)}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-gray-500 mb-1">Residency</p>
                <p className="text-sm font-semibold text-gray-200">{student.residencyType || "Day Scholar"}</p>
              </div>
            </div>
          </div>

          <div className="bg-lime-400/5 rounded-lg p-4 border border-lime-400/10 space-y-2">
            <p className="text-xs text-lime-400 mb-1">Parent Information</p>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-lime-400 mb-1">Parent Name</span>
                <div className="text-sm font-semibold text-gray-200">{student.fatherName || "-"}</div>
              </div>
              <div>
                <span className="text-xs text-lime-400 mb-1">Email</span>
                <div className="text-sm font-semibold text-gray-200">{email}</div>
              </div>
              <div>
                <span className="text-xs text-lime-400 mb-1">Phone</span>
                <div className="text-sm font-semibold text-gray-200">{student.phoneNo || "-"}</div>
              </div>
              <div>
                <span className="text-xs text-lime-400 mb-1">Address</span>
                <div className="text-sm font-semibold text-gray-200">{student.address || "-"}</div>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 md:px-6 py-2.5 border border-white/10
               rounded-xl text-gray-400 font-medium hover:bg-white/5 transition-all text-sm"
            >
              Close
            </button>
            <button
              onClick={onEdit}
              className="flex-1 px-4 md:px-6 py-2.5 bg-lime-400 hover:bg-lime-500 text-black rounded-xl font-medium transition-all
               shadow-[0_0_15px_rgba(163,230,53,0.3)] text-sm flex items-center justify-center gap-2"
            >
              Edit Student
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
