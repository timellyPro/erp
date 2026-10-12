import React, { useState } from "react";
import StudentLeave from "./leavefolder/studentLeave";
import TeacherLeave from "./leavefolder/TeacherLeave";
import { 
  GraduationCap, Briefcase 
} from "lucide-react";

export default function TeacherLeavesTab() {
  const [activeTab, setActiveTab] = useState("student");

  return (
    <div className=" text-white ">
      {/* 1. Main Toggle Switch (Centered) */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setActiveTab("student")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 ${
              activeTab === "student"
                ? "bg-[#b4f03d] text-black border border-white/40 shadow-[0_0_20px_rgba(180,240,61,0.3)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            <GraduationCap size={18} strokeWidth={2.5} />
            <span>Student Requests</span>
          </button>
          <button
            onClick={() => setActiveTab("applications")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 ${
              activeTab === "applications"
                ? "bg-[#b4f03d] text-black border border-white/40 shadow-[0_0_20px_rgba(180,240,61,0.3)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Briefcase size={18} strokeWidth={2.5} />
            <span>My Applications</span>
          </button>
        </div>
      </div>

      {/* 2. Conditional Rendering Logic */}
      <div className="max-w-6xl mx-auto transition-all duration-500">
        {activeTab === "student" ? (
          <StudentLeave />
        ) : (
          <TeacherLeave />
        )}
      </div>
    </div>
  );
}