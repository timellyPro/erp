"use client";

import { useMemo } from "react";
import {
  Calculator,
  Microscope,
  BookOpen,
  Languages,
  Globe,
  Laptop,
  TrendingUp,
} from "lucide-react";

interface Mark {
  id: string;
  subject: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  examType?: string | null;
  createdAt?: string;
}

interface SubjectPerformanceProps {
  marks: Mark[];
}

type Subject = {
  name: string;
  marks: number;
  total: number;
  classAvg: number;
  grade: string;
  icon: React.ReactNode;
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

const SubjectPerformance = ({ marks }: SubjectPerformanceProps) => {
  const subjects: Subject[] = useMemo(() => {
    const subjectMap = new Map<string, Mark>();
    marks.forEach((mark) => {
      const existing = subjectMap.get(mark.subject);
      if (!existing || (mark.createdAt && existing.createdAt && new Date(mark.createdAt) > new Date(existing.createdAt))) {
        subjectMap.set(mark.subject, mark);
      }
    });

    return Array.from(subjectMap.values()).map((mark) => {
      const _percentage = mark.totalMarks > 0 ? (mark.marks / mark.totalMarks) * 100 : 0;
      return {
        name: mark.subject,
        marks: mark.marks,
        total: mark.totalMarks,
        classAvg: 0,
        grade: mark.grade || calculateGrade(mark.marks, mark.totalMarks),
        icon: getSubjectIcon(mark.subject),
      };
    });
  }, [marks]);
  return (
    <div className="mt-8 max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">

      {/* HEADER */}
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          Subject-wise Performance
        </h2>
        <p className="text-gray-400 mt-1 text-sm sm:text-base">
          Detailed analysis of each subject
        </p>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">

        {subjects.length > 0 ? (
          subjects.map((subject) => {
            const percentage = subject.total > 0 ? Math.round((subject.marks / subject.total) * 100) : 0;

            return (
              <div
                key={subject.name}
                className="
                  relative
                  p-6
                  rounded-2xl
                  bg-gradient-to-br
                 
                  border border-white/10
                  backdrop-blur-xl
                  shadow-lg
                  hover:shadow-xl
                  transition-all duration-300
                "
              >
                {/* TOP ROW */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-lime-400/10 text-lime-400 flex items-center justify-center">
                      {subject.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white capitalize">
                        {subject.name}
                      </h3>
                      <p className="text-sm text-gray-400">
                        Marks: {Math.round(subject.marks)}/{Math.round(subject.total)}
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 text-xs font-bold rounded-full bg-lime-400/10 text-lime-400 border border-lime-400/20">
                    {subject.grade}
                  </span>
                </div>

                {/* PROGRESS */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Your Score</span>
                    <span className="text-lime-400 font-semibold">
                      {percentage}%
                    </span>
                  </div>

                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-lime-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>

                {/* CLASS AVG */}
                {subject.classAvg > 0 ? (
                  <div className="flex items-center justify-between text-sm mt-4">
                    <span className="text-gray-400">
                      Class Avg:{" "}
                      <span className="text-white font-medium">
                        {subject.classAvg}%
                      </span>
                    </span>

                    <span className="flex items-center gap-1 px-3 py-1 bg-lime-400/10 text-lime-400 rounded-full text-xs font-semibold border border-lime-400/20">
                      <TrendingUp className="w-3 h-3" />
                      +{Math.round(subject.marks - subject.classAvg)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-sm mt-4">
                    <span className="text-gray-400">
                      Class average not available
                    </span>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="col-span-full text-center py-12 text-white/40 text-sm">
            No marks available
          </div>
        )}

      </div>
    </div>
  );
};

export default SubjectPerformance;
