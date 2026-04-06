'use client';

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  TrendingUp,
  Trophy,
  Award,
  Target,
  Download,
  Loader2,
} from "lucide-react";
import ProgressReport from "./ProgressReport";
import SubjectPerformance from "./SubjetPerformance";
import Spinner from "../../common/Spinner";
import { generatePDF } from "@/lib/pdfUtils";
import MarksReportTemplate, { type MarksReportData } from "../../pdf/MarksReportTemplate";
import { useRef } from "react";

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

function calculateGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C+";
  if (percentage >= 40) return "C";
  return "D";
}

function getGradeLabel(percentage: number): string {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 80) return "Very Good";
  if (percentage >= 70) return "Good";
  if (percentage >= 60) return "Average";
  if (percentage >= 50) return "Below Average";
  return "Needs Improvement";
}

export default function ParentMarksTab() {
  const { data: session } = useSession();
  const sessionSchoolName =
    typeof (session?.user as any)?.schoolName === "string" ? (session?.user as any).schoolName : "";
  const [marks, setMarks] = useState<Mark[]>([]);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [schoolName, setSchoolName] = useState(sessionSchoolName || "");
  const [rank, setRank] = useState<number | null>(null);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [examTypeFilter, setExamTypeFilter] = useState<string>("ALL");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [marksRes, analyticsRes, userRes, schoolRes] = await Promise.all([
          fetch("/api/marks/view", { credentials: "include" }),
          fetch("/api/analytics/student", { credentials: "include" }),
          fetch("/api/user/me", { credentials: "include" }),
          fetch("/api/school/mine", { credentials: "include" }),
        ]);

        if (marksRes.ok) {
          const marksData = await marksRes.json();
          setMarks(marksData.marks || []);
        }

        if (schoolRes.ok) {
          const schoolData = await schoolRes.json();
          const n = schoolData?.school?.name;
          if (typeof n === "string" && n.trim()) {
            setSchoolName(n.trim());
          }
        }

        // Get student ID from user session
        let studentId: string | null = null;
        if (userRes.ok) {
          const userData = await userRes.json();
          studentId = userData.user?.studentId || null;
        }

        if (analyticsRes.ok) {
          const analyticsData = await analyticsRes.json();
          const student = analyticsData.student;
          
          // Get rank from analytics data
          if (analyticsData.stats?.grade?.rank !== undefined && analyticsData.stats.grade.rank !== null) {
            setRank(analyticsData.stats.grade.rank);
          }
          
          if (student) {
            // The analytics API returns student.photoUrl directly and class as a string
            const classParts = typeof student.class === 'string' ? student.class.split(' • ') : [];
            const studentInfoData = {
              name: student.name || "Student",
              class: classParts[0] || "",
              section: classParts[1] || null,
              photoUrl: student.photoUrl || null,
              rollNo: student.rollNo || undefined,
            };
            setStudentInfo(studentInfoData);
            if (typeof student.schoolName === "string" && student.schoolName.trim()) {
              setSchoolName(student.schoolName.trim());
            }
          } else if (studentId) {
            // Fallback: fetch student details directly if analytics doesn't have it
            try {
              const studentRes = await fetch(`/api/student/${studentId}`, { credentials: "include" });
              if (studentRes.ok) {
                const studentData = await studentRes.json();
                const student = studentData.student;
                if (student) {
                  setStudentInfo({
                    name: student.user?.name || "Student",
                    class: student.class?.name || "",
                    section: student.class?.section || null,
                    photoUrl: student.user?.photoUrl || null,
                    rollNo: student.rollNo || undefined,
                  });
                  if (typeof student.schoolName === "string" && student.schoolName.trim()) {
                    setSchoolName(student.schoolName.trim());
                  }
                  
                  // Try to get class students count for rank context
                  if (student.classId) {
                    try {
                      const classStudentsRes = await fetch(`/api/class/students?classId=${student.classId}`, { credentials: "include" });
                      if (classStudentsRes.ok) {
                        const classStudentsData = await classStudentsRes.json();
                        if (classStudentsData.students && Array.isArray(classStudentsData.students)) {
                          setTotalStudents(classStudentsData.students.length);
                        }
                      }
                    } catch (e) {
                      // Ignore error for class count
                    }
                  }
                }
              }
            } catch (e) {
              console.error("Failed to fetch student details:", e);
            }
          }
          
          // Try to get total students count if we have class info
          if (studentInfo?.class && !totalStudents) {
            try {
              // This would require the classId, which we might not have from analytics
              // We'll leave this for now and can enhance later
            } catch (e) {
              // Ignore
            }
          }
        }
      } catch (e) {
        console.error("Failed to load marks:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const examTypeOptions = useMemo(() => {
    const types = new Set<string>();
    marks.forEach((m) => {
      if (m.examType && m.examType.trim()) {
        types.add(m.examType.trim());
      }
    });
    return ["ALL", ...Array.from(types).sort()];
  }, [marks]);

  const filteredMarks = useMemo(() => {
    if (examTypeFilter === "ALL") return marks;
    return marks.filter(
      (m) => (m.examType || "").trim() === examTypeFilter
    );
  }, [marks, examTypeFilter]);

  const stats = useMemo(() => {
    if (filteredMarks.length === 0) {
      return {
        overallScore: 0,
        overallGrade: "N/A",
        gradeLabel: "No Data",
        totalMarks: 0,
        totalMaxMarks: 0,
      };
    }

    const totalMarks = filteredMarks.reduce((sum, m) => sum + m.marks, 0);
    const totalMaxMarks = filteredMarks.reduce(
      (sum, m) => sum + m.totalMarks,
      0
    );
    const overallScore = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;
    const overallGrade = calculateGrade(overallScore);
    const gradeLabel = getGradeLabel(overallScore);

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      overallGrade,
      gradeLabel,
      totalMarks: Math.round(totalMarks),
      totalMaxMarks: Math.round(totalMaxMarks),
    };
  }, [filteredMarks]);

  const studentName = studentInfo?.name || "Student";

  const handleDownloadReport = async () => {
    try {
      setGeneratingPdf(true);
      setTimeout(async () => {
        try {
          await generatePDF(reportRef, `Marks_Report_${studentName.replace(/\s+/g, '_')}.pdf`);
        } catch (err) {
          console.error(err);
        } finally {
          setGeneratingPdf(false);
        }
      }, 500);
    } catch (err) {
      console.error(err);
      setGeneratingPdf(false);
    }
  };

  const reportData: MarksReportData = useMemo(() => ({
    schoolName,
    studentName,
    studentClass: studentInfo?.class || "N/A",
    dateGenerated: new Date(),
    overallScore: stats.overallScore,
    overallGrade: stats.overallGrade,
    totalMarks: stats.totalMarks,
    totalMaxMarks: stats.totalMaxMarks,
    rank,
    marks: filteredMarks.map(m => ({
      subject: m.subject,
      marks: m.marks,
      totalMarks: m.totalMarks,
      grade: m.grade,
      examType: m.examType,
    }))
  }), [schoolName, studentName, studentInfo, stats, rank, filteredMarks]);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 min-h-screen text-white flex items-center justify-center">
        <div className="text-center">
          <Spinner/>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white px-3 sm:px-0 pb-6 overflow-x-hidden">

      {/* HEADER */}
      <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">
              Academic Performance
            </h1>
            <p className="text-white/60">
              Track {studentName}'s marks and grades
            </p>
          </div>
          <button
            onClick={handleDownloadReport}
            disabled={generatingPdf}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors font-medium text-sm border border-white/10 disabled:opacity-50"
          >
            {generatingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download Report
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">

        {/* Overall Score */}
        <div className="relative rounded-2xl border border-white/10 p-6 backdrop-blur-xl hover:border-lime-400/30 transition">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-white/5 rounded-xl">
              <TrendingUp className="w-5 h-5 text-lime-400" />
            </div>
            <span className="px-3 py-1 text-xs rounded-lg bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold">
              {stats.gradeLabel}
            </span>
          </div>
          <div className="mt-6">
            <p className="text-sm text-white/60 mb-1">Overall Score</p>
            <h2 className="text-3xl font-bold">{stats.overallScore}%</h2>
            <p className="text-sm text-white/50 mt-1">
              {stats.totalMarks > 0 ? "Based on all subjects" : "No marks available"}
            </p>
          </div>
        </div>

        {/* Class Rank */}
        <div className="relative rounded-2xl border border-white/10 p-6 backdrop-blur-xl hover:border-lime-400/30 transition">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-white/5 rounded-xl">
              <Trophy className="w-5 h-5 text-lime-400" />
            </div>
            <span className={`px-3 py-1 text-xs rounded-lg border font-semibold ${
              rank && rank <= 3 
                ? "bg-lime-400/10 text-lime-400 border-lime-400/20" 
                : rank 
                ? "bg-blue-400/10 text-blue-400 border-blue-400/20"
                : "bg-white/5 text-gray-400 border-white/10"
            }`}>
              {rank && rank <= 3 ? "Top 3" : rank ? "Ranked" : "N/A"}
            </span>
          </div>
          <div className="mt-6">
            <p className="text-sm text-white/60 mb-1">Class Rank</p>
            <h2 className="text-3xl font-bold text-lime-400">
              {rank ? `#${rank}` : "N/A"}
            </h2>
            <p className="text-sm text-white/50 mt-1">
              {rank 
                ? totalStudents 
                  ? `Out of ${totalStudents} students`
                  : "In your class"
                : "Not available"
              }
            </p>
          </div>
        </div>

        {/* Current Grade */}
        <div className="relative rounded-2xl border border-white/10  p-6 backdrop-blur-xl hover:border-lime-400/30 transition">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-white/5 rounded-xl">
              <Award className="w-5 h-5 text-lime-400" />
            </div>
            <span className="px-3 py-1 text-xs rounded-lg bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold">
              Pass
            </span>
          </div>
          <div className="mt-6">
            <p className="text-sm text-white/60 mb-1">Current Grade</p>
            <h2 className="text-3xl font-bold">{stats.overallGrade}</h2>
            <p className="text-sm text-white/50 mt-1">
              Overall performance
            </p>
          </div>
        </div>

        {/* Total Marks */}
        <div className="relative rounded-2xl border border-white/10  p-6 backdrop-blur-xl hover:border-lime-400/30 transition">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-white/5 rounded-xl">
              <Target className="w-5 h-5 text-lime-400" />
            </div>
            <span className="px-3 py-1 text-xs rounded-lg bg-white/5 text-gray-400 border border-white/10 font-semibold">
              Progress
            </span>
          </div>
          <div className="mt-6">
            <p className="text-sm text-white/60 mb-1">Total Marks</p>
            <h2 className="text-3xl font-bold">{stats.totalMarks}/{stats.totalMaxMarks}</h2>
            <p className="text-sm text-white/50 mt-1">
              Score obtained
            </p>
          </div>
        </div>

      </div>
      <div>
        <ProgressReport
          marks={filteredMarks}
          studentInfo={studentInfo}
          examTypeFilter={examTypeFilter}
          examTypeOptions={examTypeOptions}
          onExamTypeChange={setExamTypeFilter}
        />
      </div>
      <div>
        <SubjectPerformance marks={filteredMarks} />
      </div>

      {/* Hidden Marks Report Template for PDF Generation */}
      <div className="pointer-events-none opacity-0 fixed -top-[10000px] -left-[10000px]">
        <MarksReportTemplate ref={reportRef} data={reportData} />
      </div>
    </div>
  );
}
