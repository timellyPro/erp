'use client';

import { useEffect, useState, useMemo } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import {
  fetchParentMarks,
  loadParentAnalytics,
  peekParentAnalytics,
  peekParentPortalAny,
} from "@/lib/loadParentPortal";
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
import ParentTimellyLoader from "../ParentTimellyLoader";
import { downloadParentPortalPdf } from "@/lib/downloadParentPortalPdf";
import { currentAcademicYearLabel, resolveSchoolBrand, type SchoolBrand } from "@/lib/resolveSchoolBrand";
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
  const sessionStudentId = session?.user?.studentId ?? null;
  const peekedMarks = peekParentPortalAny<{ marks: Mark[] }>("marks", "all");
  const peekedAnalytics = peekParentAnalytics(sessionStudentId);
  const [marks, setMarks] = useState<Mark[]>(() => peekedMarks?.marks ?? []);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(() => {
    const student = peekedAnalytics?.student;
    if (!student) return null;
    const classParts = typeof student.class === "string" ? student.class.split(" • ") : [];
    return {
      name: student.name || "Student",
      class: classParts[0] || "",
      section: classParts[1] || null,
      photoUrl: student.photoUrl || null,
      rollNo: student.rollNo || undefined,
    };
  });
  const [schoolName, setSchoolName] = useState(
    peekedAnalytics?.student?.schoolName?.trim() || sessionSchoolName || ""
  );
  const [rank, setRank] = useState<number | null>(peekedAnalytics?.stats?.grade?.rank ?? null);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  const [loading, setLoading] = useState(!(peekedMarks?.marks?.length || peekedAnalytics));
  const [examTypeFilter, setExamTypeFilter] = useState<string>("ALL");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [schoolBrand, setSchoolBrand] = useState<SchoolBrand | null>(null);
  const [pdfReportData, setPdfReportData] = useState<MarksReportData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void resolveSchoolBrand().then(setSchoolBrand);
  }, []);

  useEffect(() => {
    if (!sessionStudentId) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [marksData, analyticsData] = await Promise.all([
          fetchParentMarks(sessionStudentId),
          loadParentAnalytics(sessionStudentId),
        ]);

        setMarks((marksData.marks || []) as Mark[]);

        const student = analyticsData.student;

        if (analyticsData.stats?.grade?.rank !== undefined && analyticsData.stats.grade.rank !== null) {
          setRank(analyticsData.stats.grade.rank);
        }

        if (student) {
          const classParts = typeof student.class === "string" ? student.class.split(" • ") : [];
          setStudentInfo({
            name: student.name || "Student",
            class: classParts[0] || "",
            section: classParts[1] || null,
            photoUrl: student.photoUrl || null,
            rollNo: student.rollNo || undefined,
          });
          if (typeof student.schoolName === "string" && student.schoolName.trim()) {
            setSchoolName(student.schoolName.trim());
          }
        }
      } catch (e) {
        console.error("Failed to load marks:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionStudentId]);

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

  const reportData: MarksReportData = useMemo(
    () => ({
      schoolName: schoolBrand?.name || schoolName,
      schoolLogo: schoolBrand?.logo,
      schoolAddress: schoolBrand?.address,
      studentName,
      studentClass: studentInfo?.class || "N/A",
      academicYear: currentAcademicYearLabel(),
      dateGenerated: new Date(),
      overallScore: stats.overallScore,
      overallGrade: stats.overallGrade,
      totalMarks: stats.totalMarks,
      totalMaxMarks: stats.totalMaxMarks,
      rank,
      marks: filteredMarks.map((m) => ({
        subject: m.subject,
        marks: m.marks,
        totalMarks: m.totalMarks,
        grade: m.grade,
        examType: m.examType,
      })),
    }),
    [schoolBrand, schoolName, studentName, studentInfo, stats, rank, filteredMarks]
  );

  const handleDownloadReport = async () => {
    setGeneratingPdf(true);
    try {
      await downloadParentPortalPdf({
        ref: reportRef,
        filename: `Marks_Report_${studentName.replace(/\s+/g, "_")}.pdf`,
        beforeCapture: (brand) => {
          flushSync(() => {
            setPdfReportData({
              ...reportData,
              schoolName: brand.name,
              schoolLogo: brand.logo,
              schoolAddress: brand.address,
            });
          });
        },
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download report.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-10 min-h-screen text-white flex items-center justify-center">
        <ParentTimellyLoader preset="marks" className="w-full max-w-2xl" />
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

      <MarksReportTemplate ref={reportRef} data={pdfReportData ?? reportData} />
    </div>
  );
}
