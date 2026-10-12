'use client';

import {
  Funnel,
  List,
  Clock,
  CheckCircle,
  AlertTriangle,
  BookOpen,
} from "lucide-react";

interface HomeworkFiltersProps {
  subject: string;
  status: string;
  onSubjectChange: (subject: string) => void;
  onStatusChange: (status: string) => void;
  filteredCount: number;
  availableSubjects: string[];
}

export default function HomeworkFilters({
  subject,
  status,
  onSubjectChange,
  onStatusChange,
  filteredCount,
  availableSubjects,
}: HomeworkFiltersProps) {
  const statusOptions = [
    { label: "All", icon: List },
    { label: "Pending", icon: Clock },
    { label: "Submitted", icon: CheckCircle },
    { label: "Late", icon: AlertTriangle },
  ];

  return (
    <section className="rounded-2xl p-6 lg:p-7 space-y-6 bg-white/5 backdrop-blur border border-white/10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Filter Homework</h3>
          <p className="text-sm text-white/70">
            Find assignments quickly
          </p>
        </div>

        <span className="self-start sm:self-auto rounded-full border border-lime-400/30 px-4 py-2 text-sm text-lime-300">
          {filteredCount} Results
        </span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Subject Filter */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-lime-400" />
            Select Subject
          </label>

          <select
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full rounded-xl px-4 py-3 
               somu text-white 
               border border-white/20 
               outline-none focus:border-lime-400 
               transition appearance-none"
          >
            <option value="All Subjects" className="bg-gray-900 text-white">
              All Subjects
            </option>

            {availableSubjects.map((subj) => (
              <option
                key={subj}
                value={subj}
                className="bg-gray-900 text-white"
              >
                {subj}
              </option>
            ))}
          </select>
        </div>
        {/* Status Filter */}
        <div className="lg:col-span-3">
          <label className="block text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <Funnel className="w-4 h-4 text-lime-400" />
            Filter by Status
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statusOptions.map(({ label, icon: Icon }) => {
              const isActive = status === label;

              return (
                <button
                  key={label}
                  onClick={() => onStatusChange(label)}
                  className={`flex flex-col items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-medium transition-all border somu
                    ${isActive
                      ? "bg-lime-400/10  border-lime-400 text-lime-300 shadow-[0_0_15px_rgba(163,230,53,0.15)]"
                      : "border-white/20 text-gray-300 hover:border-white/40 hover:bg-white/5"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}