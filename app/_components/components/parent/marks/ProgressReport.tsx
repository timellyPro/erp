


"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Calculator,
  Target,
  TrendingUp,
  Trophy,
  Microscope,
  Languages,
  Globe,
  Laptop,
  ChevronDown,
} from "lucide-react";
import StatCard from "../../common/statCard";
import StudentPerformanceCard from "./StudentPerformanceCard";

interface Mark {
  id: string;
  subject: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  examType?: string | null;
  createdAt?: string;
}

interface StudentInfo {
  name: string;
  class: string;
  section: string | null;
  photoUrl: string | null;
  rollNo?: string;
}

interface ProgressReportProps {
  marks: Mark[];
  studentInfo: StudentInfo | null;
  examTypeFilter?: string;
  examTypeOptions?: string[];
  onExamTypeChange?: (value: string) => void;
}

type Subject = {
  name: string;
  score: number;
  total: number;
  grade: string;
  icon?: React.ReactNode;
};

function getSubjectIcon(subjectName: string): React.ReactNode {
  const name = subjectName.toLowerCase();
  if (name.includes("math") || name.includes("mathematics")) {
    return <Calculator className="w-5 h-5" />;
  }
  if (name.includes("science")) {
    return <Microscope className="w-5 h-5" />;
  }
  if (name.includes("english")) {
    return <BookOpen className="w-5 h-5" />;
  }
  if (name.includes("hindi") || name.includes("telugu") || name.includes("language")) {
    return <Languages className="w-5 h-5" />;
  }
  if (name.includes("social") || name.includes("history") || name.includes("geography")) {
    return <Globe className="w-5 h-5" />;
  }
  if (name.includes("computer") || name.includes("it")) {
    return <Laptop className="w-5 h-5" />;
  }
  return <BookOpen className="w-5 h-5" />;
}

function calculateGrade(marks: number, totalMarks: number): string {
  const percentage = (marks / totalMarks) * 100;
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C+";
  if (percentage >= 40) return "C";
  return "D";
}

const ProgressReport = ({
  marks,
  studentInfo,
  examTypeFilter,
  examTypeOptions,
  onExamTypeChange,
}: ProgressReportProps) => {
  const subjects: Subject[] = useMemo(() => {
    const subjectMap = new Map<string, Mark>();
    marks.forEach((mark) => {
      const existing = subjectMap.get(mark.subject);
      if (!existing || (mark.createdAt && existing.createdAt && new Date(mark.createdAt) > new Date(existing.createdAt))) {
        subjectMap.set(mark.subject, mark);
      }
    });

    return Array.from(subjectMap.values()).map((mark) => ({
      name: mark.subject,
      score: mark.marks,
      total: mark.totalMarks,
      grade: mark.grade || calculateGrade(mark.marks, mark.totalMarks),
      icon: getSubjectIcon(mark.subject),
    }));
  }, [marks]);

  const [animatedScores, setAnimatedScores] = useState<number[]>(subjects.map(() => 0));
  const [examTypeMenuOpen, setExamTypeMenuOpen] = useState(false);

  const { totalMarks, totalMax, percentage } = useMemo(() => {
    const totalMarks = subjects.reduce((acc, s) => acc + s.score, 0);
    const totalMax = subjects.reduce((acc, s) => acc + s.total, 0);
    const percentage = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0;

    return { totalMarks, totalMax, percentage };
  }, [subjects]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScores(subjects.map((s) => (s.total > 0 ? (s.score / s.total) * 100 : 0)));
    }, 300);

    return () => clearTimeout(timer);
  }, [subjects]);

  const currentExamLabel =
    examTypeFilter && examTypeFilter !== "ALL" ? examTypeFilter : "All exams";

  const availableExamTypes =
    examTypeOptions && examTypeOptions.length > 0 ? examTypeOptions : ["ALL"];

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto">
      <div className="mt-6 sm:mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg overflow-hidden animate-fade-in">
        
        {/* ================= HEADER ================= */}
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 border-b border-white/10 bg-white/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight">
                Progress Report
              </h2>
              <p className="text-gray-400 text-xs sm:text-sm">
                Academic Performance Overview
              </p>
            </div>

            {onExamTypeChange && availableExamTypes.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExamTypeMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-black/40 border border-white/15 text-xs sm:text-sm font-semibold text-white hover:border-lime-400/40 hover:bg-black/60 transition-colors"
                >
                  {currentExamLabel}
                  <ChevronDown className="w-4 h-4 text-white/60" />
                </button>

                {examTypeMenuOpen && (
                  <div className="absolute right-0 mt-2 w-40 sm:w-44 bg-[#050816] border border-white/10 rounded-xl shadow-xl py-1 z-20">
                    {Array.from(new Set(availableExamTypes)).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          onExamTypeChange(opt);
                          setExamTypeMenuOpen(false);
                        }}
                        className={`block w-full text-left px-3 py-1.5 text-xs sm:text-sm ${
                          (examTypeFilter || "ALL") === opt
                            ? "bg-lime-400/10 text-lime-300"
                            : "text-white/80 hover:bg-white/5"
                        }`}
                      >
                        {opt === "ALL" ? "All exams" : opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= MAIN GRID ================= */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-8 p-4 sm:p-6 lg:p-8">

          {/* ================= LEFT SECTION ================= */}
          <div className="xl:col-span-2 space-y-6">

            {/* ================= STUDENT CARD ================= */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 sm:p-5 bg-white/[0.03] rounded-2xl border border-white/[0.05]">
              
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/[0.1] bg-white/5">
                {studentInfo?.photoUrl ? (
                  <img
                    src={studentInfo.photoUrl}
                    alt={studentInfo.name || "Student"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('ui-avatars.com')) {
                        target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(studentInfo?.name || "Student")}&size=80&background=4ade80&color=fff`;
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-lime-400/20 to-lime-600/20 flex items-center justify-center">
                    <span className="text-2xl font-bold text-lime-400">
                      {(studentInfo?.name || "Student").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  {studentInfo?.name || "Student"}
                </h3>
                <p className="text-sm text-gray-400">
                  {studentInfo?.class ? `${studentInfo.class}${studentInfo.section ? ` • Section ${studentInfo.section}` : ""}` : "Not assigned"}
                </p>
              </div>

              <div className="text-center sm:text-right mt-3 sm:mt-0">
                <div className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#A3E635]">
                  {percentage}%
                </div>
                <div className="text-xs text-[rgb(204,213,238)] mt-1">
                  Overall Percentage
                </div>
              </div>
            </div>

            {/* ================= STAT CARDS ================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <StatCard
                variant="gradientCentered"
                title="Marks Obtained"
                value={`${totalMarks}`}
                subtitle={`out of ${totalMax}`}
                icon={<Target className="w-5 h-5 text-lime-400" />}
              />

              <StatCard
                variant="gradientCentered"
                title="Percentage"
                value={`${percentage}%`}
                subtitle="Above Average"
                icon={<TrendingUp className="w-5 h-5 text-lime-400" />}
              />

              <StatCard
                variant="gradientCentered"
                title="Subjects"
                value={subjects.length.toString()}
                subtitle="Total subjects"
                icon={<Trophy className="w-5 h-5 text-gray-200" />}
              />
            </div>

            {/* ================= SUBJECT PERFORMANCE ================= */}
            <div>
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#A3E635]" />
                Subject Performance
              </h4>

              <div className="space-y-3 sm:space-y-4">
                {subjects.length > 0 ? (
                  subjects.map((subject, index) => {
                    const percent = subject.total > 0 ? Math.round(
                      (subject.score / subject.total) * 100
                    ) : 0;

                    return (
                      <div
                        key={subject.name}
                        className="bg-white/[0.03] rounded-xl p-3 sm:p-4 border border-white/[0.05] hover:bg-white/[0.05] transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-[#A3E635]/10 rounded-xl text-[#A3E635] group-hover:scale-110 transition-transform">
                            {subject.icon}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-semibold text-gray-200 text-sm sm:text-base capitalize">
                                {subject.name}
                              </h5>

                              <div className="flex items-center gap-3">
                                <span className="text-xs sm:text-sm text-[rgb(204,213,238)]">
                                  {Math.round(subject.score)}/{Math.round(subject.total)}
                                </span>

                                <span className="px-3 py-1 bg-[#A3E635]/10 text-[#A3E635] text-xs font-bold rounded-full border border-[#A3E635]/20">
                                  {subject.grade}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-white/[0.1] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#A3E635] rounded-full transition-all duration-1000 ease-out"
                                  style={{ width: `${animatedScores[index] || 0}%` }}
                                />
                              </div>

                              <span className="text-xs text-gray-500 w-12 text-right">
                                {percent}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-white/40 text-sm">
                    No marks available
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ================= RIGHT SECTION ================= */}
          <div className="xl:col-span-1">
            <StudentPerformanceCard
              name={studentInfo?.name || "Student"}
              grade={studentInfo?.class ? `${studentInfo.class}${studentInfo.section ? ` • ${studentInfo.section}` : ""}` : "Not assigned"}
              imageUrl={
                studentInfo?.photoUrl 
                  ? studentInfo.photoUrl 
                  : `https://ui-avatars.com/api/?name=${encodeURIComponent(studentInfo?.name || "Student")}&size=200&background=4ade80&color=fff`
              }
              score={percentage}
              classAverage={0}
              attendance={0}
              stats={[
                { title: "Subjects", value: subjects.length.toString(), icon: BookOpen },
                { title: "Total Marks", value: `${totalMarks}/${totalMax}`, icon: Target },
              ]}
              gradingScale={[
                { label: "E - Excellent", range: "90-100", color: "text-[#A3E635]" },
                { label: "G - Good", range: "75-89", color: "text-blue-400" },
                { label: "A - Average", range: "50-74", color: "text-yellow-400" },
              ]}
            />
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProgressReport;
