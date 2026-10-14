"use client";

import React from 'react';
import type { TeacherExam } from "./examTypes";
import { Calendar, Clock, Pencil, Trash2, EyeIcon } from "lucide-react";

interface ExamCardProps {
  exam: TeacherExam;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ExamCard({ exam, onView, onEdit, onDelete }: ExamCardProps) {
  // Logic for dynamic status colors to match the UI screenshots
  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'upcoming': return 'bg-lime-400/10 text-lime-400 border-lime-400/20';
      case 'completed': return 'text-white/60 bg-white/10 border-white/20';
      case 'draft': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      default: return 'text-white bg-white/10 border-white/10';
    }
  };

  const coverage =
    !exam.syllabus || exam.syllabus.length === 0
      ? 0
      : Math.min(100, Math.max(0, Math.round(
          exam.syllabus.reduce((s: number, x) => s + (Number(x.completedPercent) || 0), 0) /
          exam.syllabus.length
        )));

  const statusLabel = typeof exam.status === "string"
    ? exam.status.charAt(0).toUpperCase() + exam.status.slice(1).toLowerCase()
    : exam.status;

  return (
    <div className="bg-white/5 border border-white/10 
    rounded-[24px] p-6 flex flex-col backdrop-blur-md shadow-2xl
     w-full transition-transform hover:scale-[1.01]
     rounded-2xl p-6 hover:bg-white/5 transition-all group border 
     border-white/5 hover:border-lime-400/30 flex flex-col h-full">
      
      {/* HEADER: Status Badge and Top Actions */}
      <div className="flex justify-between items-start">
        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${getStatusStyles(exam.status)}`}>
          {statusLabel}
        </span>
        <div className="flex gap-2">
          <button onClick={onEdit} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors">
            <Pencil size={16} />
          </button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* EXAM INFO */}
      <h3 className={`text-lg font-bold text-white mb-1 group-hover:text-lime-400 transition-colors ${exam.status.toLowerCase() === 'upcoming' ? 'text-[#b4ff39]' : 'text-white'}`}>
        {exam.name}
      </h3>
      <p className="text-gray-400 text-sm mb-4">
        Class {exam.class?.name ?? ""}{exam.class?.section != null ? `-${exam.class.section}` : ""}{exam.subject ? ` • ${exam.subject}` : ""}
      </p>

      {/* SCHEDULE DETAILS */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-3 text-white/60">
          <Calendar className="lucide lucide-calendar w-4 h-4 text-lime-400" />
          <span className="text-sm font-medium">{exam.date}</span>
        </div>
        <div className="flex items-center gap-3 text-white/60">
          <Clock className=" w-4 h-4 text-lime-400" />
          <span className="text-sm font-medium">{exam.time} <span className="text-white/20 ml-1">({exam.duration})</span></span>
        </div>
      </div>

      {/* SYLLABUS PROGRESS */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Syllabus Coverage</span>
          <span className="text-xs font-bold text-white">{coverage}%</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#b4ff39] rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(180,255,57,0.4)]"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="grid grid-cols-2 gap-3 mt-8">
        <button 
          onClick={onEdit} 
          className="flex-1 py-2.5 bg-lime-400/10 hover:bg-lime-400/20 border
           border-lime-400/20 rounded-xl text-sm font-bold 
          text-lime-400 transition-all flex items-center justify-center gap-2"
        >
          <Pencil size={14} /> Edit Details
        </button>
        <button 
          onClick={onView} 
          className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 
          border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:text-white 
          transition-all flex items-center justify-center gap-2"
        >
          <EyeIcon size={14} /> View Details
        </button>
      </div>
    </div>
  );
}