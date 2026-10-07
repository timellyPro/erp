"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import {
  Download,
  GraduationCap,
  Award,
  TrendingUp,
  BookOpen,
  Clock,
  Calendar,
  BarChart3,
  User,
  Phone,
  FileText,
  ChevronDown,
} from "lucide-react";
import ParentTimellyLoader from "../ParentTimellyLoader";
import ProfileReportTemplate, { type ProfileReportData } from "../../pdf/ProfileReportTemplate";
import { downloadParentPortalPdf } from "@/lib/downloadParentPortalPdf";
import { currentAcademicYearLabel, resolveSchoolBrand } from "@/lib/resolveSchoolBrand";
import PageHeader from "../../common/PageHeader";
import {
  fetchParentHomeworkList,
  fetchParentEventsList,
  fetchParentMarks,
  fetchParentProfileShell,
  peekParentDashboard,
  peekParentProfileShell,
} from "@/lib/loadParentPortal";

type StudentProfile = {
  student: {
    id: string;
    name: string;
    admissionNumber: string;
    email: string;
    photoUrl: string | null;
    rollNo: string;
    dob: string;
    age: number | null;
    address: string;
    phone: string;
    fatherName: string;
    motherName?: string;
    gender?: string;
    previousSchool?: string;
    status?: string;
    class: { id: string; name: string; section: string | null; displayName: string } | null;
  };
  attendanceTrends: Array<{ month: string; present: number; total: number; pct: number }>;
  academicPerformance: Array<{ subject: string; score: number }>;
  certificates: Array<{ id: string; title: string; issuedDate: string }>;
};

function InfoTag({ value, icon: Icon }: { value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-white/5 border border-white/10 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-white text-xs sm:text-sm transition-all duration-200 hover:border-white/20 hover:bg-white/10 truncate max-w-full">
      {Icon && <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-lime-400 shrink-0" />}
      <span className="truncate">{value}</span>
    </div>
  );
}

export default function ParentProfile() {
  const { data: session, status } = useSession();
  const studentId = (session?.user as { studentId?: string | null })?.studentId ?? null;
  const initialProfile = peekParentProfileShell(studentId) as StudentProfile | null;
  const initialDash = peekParentDashboard(studentId);

  const [profile, setProfile] = useState<StudentProfile | null>(initialProfile);
  const [user, setUser] = useState<{ name: string | null; photoUrl: string | null; mobile: string | null } | null>(null);
  const [homeworkTotal, setHomeworkTotal] = useState(initialDash?.homeworkTotal ?? 0);
  const [homeworkSubmitted, setHomeworkSubmitted] = useState(initialDash?.homeworkSubmitted ?? 0);
  const [pendingHomework, setPendingHomework] = useState(
    Math.max(0, (initialDash?.homeworkTotal ?? 0) - (initialDash?.homeworkSubmitted ?? 0))
  );
  const [upcomingEvents, setUpcomingEvents] = useState(0);
  const [loading, setLoading] = useState(!initialProfile);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfReportData, setPdfReportData] = useState<ProfileReportData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [examTypeFilter, setExamTypeFilter] = useState<string>("ALL");
  // compute academic year string based on current date
  const [academicYear, setAcademicYear] = useState("");
  type Mark = {
    id: string;
    subject: string;
    marks: number;
    totalMarks: number;
    grade?: string | null;
    examType?: string | null;
    createdAt?: string;
  };

  const [marks, setMarks] = useState<Mark[]>([]);

  const fetchData = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      setError("No student linked to this account.");
      return;
    }
    if (!profile) setLoading(true);
    setError(null);
    try {
      const [userRes, profileData] = await Promise.all([
        fetch("/api/user/me", { credentials: "include" }),
        fetchParentProfileShell(studentId),
      ]);
      if (userRes.ok) {
        const d = await userRes.json();
        setUser(d.user ?? null);
      }
      if (profileData) {
        setProfile(profileData as StudentProfile);
      } else {
        setError("Failed to load profile");
      }

      const dash = peekParentDashboard(studentId);
      if (dash) {
        setHomeworkTotal(dash.homeworkTotal);
        setHomeworkSubmitted(dash.homeworkSubmitted);
        setPendingHomework(Math.max(0, dash.homeworkTotal - dash.homeworkSubmitted));
      }

      void Promise.all([
        fetchParentHomeworkList(studentId),
        fetchParentEventsList(studentId),
        fetchParentMarks(studentId),
      ])
        .then(([homeworkData, eventsData, marksData]) => {
          const hwList = homeworkData.homeworks ?? [];
          setHomeworkTotal(hwList.length);
          const submitted = hwList.filter((h) => (h as { hasSubmitted?: boolean }).hasSubmitted).length;
          setHomeworkSubmitted(submitted);
          setPendingHomework(hwList.length - submitted);

          const evList = eventsData.events ?? [];
          const now = new Date();
          const upcoming = evList.filter(
            (e) =>
              (e as { eventDate?: string }).eventDate &&
              new Date((e as { eventDate: string }).eventDate) >= now
          ).length;
          setUpcomingEvents(upcoming);
          setMarks((marksData.marks ?? []) as Mark[]);
        })
        .catch(() => undefined);
      // Academic year calc
      const yr = new Date().getFullYear();
      setAcademicYear(`${yr - 1}-${yr}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      setLoading(false);
      setError("Please sign in.");
      return;
    }
    fetchData();
  }, [session?.user, status, fetchData]);

  useEffect(() => {
    void resolveSchoolBrand();
  }, []);

  const filteredMarks = useMemo(() => {
    if (examTypeFilter === "ALL") return marks;
    return marks.filter((m) => (m.examType || "").trim() === examTypeFilter);
  }, [marks, examTypeFilter]);

  const filteredPerformance = useMemo(() => {
    if (!profile) return [];
    if (filteredMarks.length > 0) {
      const bySubject = new Map<string, { total: number; max: number }>();
      filteredMarks.forEach((m) => {
        const existing = bySubject.get(m.subject) || { total: 0, max: 0 };
        existing.total += m.marks;
        existing.max += m.totalMarks;
        bySubject.set(m.subject, existing);
      });
      return Array.from(bySubject.entries()).map(([subject, agg]) => ({
        subject,
        score: agg.max > 0 ? Math.round((agg.total / agg.max) * 100) : 0,
      }));
    }
    return profile.academicPerformance;
  }, [profile, filteredMarks]);

  const attendancePct = useMemo(() => {
    if (!profile || profile.attendanceTrends.length === 0) return 0;
    return Math.round(
      profile.attendanceTrends.reduce((a, t) => a + t.pct, 0) / profile.attendanceTrends.length
    );
  }, [profile]);

  const overallGrade = useMemo(() => {
    if (filteredPerformance.length === 0) return "—";
    const avg = Math.round(
      filteredPerformance.reduce((a, x) => a + x.score, 0) / filteredPerformance.length
    );
    if (avg >= 90) return "A+";
    if (avg >= 80) return "A";
    if (avg >= 70) return "B+";
    if (avg >= 60) return "B";
    return "C";
  }, [filteredPerformance]);

  const stats = useMemo(
    () => [
      { label: "Overall grade", value: overallGrade, icon: Award },
      { label: "Attendance", value: `${attendancePct}%`, icon: TrendingUp },
      { label: "Total assignments", value: String(homeworkTotal), icon: BookOpen },
      { label: "Pending homework", value: String(pendingHomework), icon: Clock },
      { label: "Upcoming events", value: String(upcomingEvents), icon: Calendar },
    ],
    [overallGrade, attendancePct, homeworkTotal, pendingHomework, upcomingEvents]
  );

  const profileReportPreview = useMemo((): ProfileReportData | null => {
    if (!profile) return null;
    const s = profile.student;
    return {
      studentName: s.name || "Student",
      admissionNumber: s.admissionNumber,
      className: s.class?.displayName,
      rollNo: s.rollNo,
      dob: s.dob,
      fatherName: s.fatherName,
      motherName: s.motherName,
      phone: s.phone || user?.mobile || undefined,
      email: s.email,
      academicYear: academicYear || currentAcademicYearLabel(),
      dateGenerated: new Date(),
      stats: stats.map((item) => ({ label: item.label, value: String(item.value) })),
      attendanceTrends: profile.attendanceTrends,
      academicPerformance: filteredPerformance,
      certificates: profile.certificates,
    };
  }, [profile, user, academicYear, stats, filteredPerformance]);

  const generatePdf = useCallback(async () => {
    if (!profileReportPreview) return;
    setPdfLoading(true);
    try {
      await downloadParentPortalPdf({
        ref: reportRef,
        filename: `Student_Profile_${profileReportPreview.admissionNumber || "report"}.pdf`,
        minHeight: 400,
        beforeCapture: (brand) => {
          flushSync(() => {
            setPdfReportData({
              ...profileReportPreview,
              schoolName: brand.name,
              schoolLogo: brand.logo,
              schoolAddress: brand.address,
            });
          });
        },
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate PDF.");
    } finally {
      setPdfLoading(false);
    }
  }, [profileReportPreview]);

  let content: ReactNode;

  if (status === "loading" || loading) {
    content = (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center">
        <ParentTimellyLoader preset="profile" className="w-full max-w-2xl" />
      </div>
    );
  } else if (error && !profile) {
    content = (
      <div className="min-h-screen p-4 sm:p-6 md:p-8">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  } else if (!profile) {
    content = null;
  } else {
    const s = profile.student;
    const photoUrl = s.photoUrl || user?.photoUrl || null;

    const examTypeOptions = (() => {
      const types = new Set<string>();
      marks.forEach((m) => {
        if (m.examType && m.examType.trim()) {
          types.add(m.examType.trim());
        }
      });
      return ["ALL", ...Array.from(types).sort()];
    })();

    content = (
    <div className="min-h-screen p-3 sm:p-5 md:p-6 pb-20 sm:pb-6 overflow-x-hidden">
      <main className="max-w-6xl mx-auto space-y-5 md:space-y-7">
        {/* Header: student name + overview */}
        <PageHeader
  title="Student Profile"
  subtitle="Manage student records and information"
  rightSlot={
    <button
      onClick={generatePdf}
      disabled={pdfLoading}
      className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl 
                 bg-lime-400/10 border border-lime-400/40 
                 text-lime-300 text-sm font-medium
                 hover:bg-lime-400/20 hover:shadow-lg 
                 transition-all duration-200 
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="w-4 h-4" />
      {pdfLoading ? "Generating..." : "Download Report"}
    </button>
  }
  
/>
        {/* Profile card: image + name + tags */}
        <section className="rounded-xl sm:rounded-2xl md:rounded-3xl  somu p-3 sm:p-4 md:p-6 lg:p-8 transition-all duration-200 hover:border-white/20">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 sm:gap-6">
            <div className="flex flex-col gap-6 min-w-0 flex-1">
              {/* Name and Subtitle Section */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shrink-0">
                  <GraduationCap className="w-8 h-8 md:w-10 md:h-10 text-lime-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
                    {s.name || "Student"}
                  </h2>
                  <p className="text-white/50 text-lg mt-1">Student Profile Overview</p>
                </div>
              </div>

              {/* Tags Row 1: Class and Roll */}
              <div className="flex flex-wrap gap-3">
                {s.class?.displayName && (
                  <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-6 py-3 rounded-3xl text-white font-medium">
                    <User className="w-5 h-5 text-lime-400" />
                    <span className="text-lg">Class {s.class.displayName}</span>
                  </div>
                )}
                {s.rollNo && (
                  <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 px-6 py-3 rounded-3xl text-white font-medium">
                    <span className="text-lg text-white/90">Roll: {s.rollNo}</span>
                  </div>
                )}
              </div>

              {/* Tags Row 2: Admission and Academic Year */}
              <div className="flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-2xl text-white/60">
                  <span className="text-sm font-medium uppercase tracking-wider">{s.admissionNumber}</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-2 rounded-2xl text-white/60">
                  <Calendar className="w-4 h-4 text-lime-400" />
                  <span className="text-sm font-medium">{academicYear}</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-stretch gap-4 md:items-end md:justify-between">
              {/* Avatar */}
              <div className="relative h-24 w-24 sm:h-32 sm:w-32 md:h-44 md:w-44 lg:h-52 lg:w-52 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-white/20 bg-white/5 transition-all duration-200 hover:border-lime-400/40 hover:shadow-lg">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt={s.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-white/5">
                    <User className="w-16 h-16 sm:w-20 sm:h-20 text-white/40" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* =========================
         PREMIUM ACADEMIC PERFORMANCE
         ========================= */}

          {filteredPerformance.length > 0 && (
            <section className="rounded-3xl  border border-white/10 p-8 shadow-xl overflow-hidden mt-10">

              {/* Header + Filter */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
                  <BarChart3 className="w-7 h-7 text-lime-400" />
                  Academic Performance
                </h2>

                {examTypeOptions.length > 1 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        const next =
                          examTypeFilter === "ALL" && examTypeOptions.length > 1
                            ? examTypeOptions[1]
                            : "ALL";
                        setExamTypeFilter(next);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 border border-white/15 text-xs sm:text-sm font-semibold text-white"
                    >
                      {examTypeFilter === "ALL" ? "All exams" : examTypeFilter}
                      <ChevronDown className="w-4 h-4 text-white/60" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-6 min-h-[340px] mt-8">
                {/* Y Axis */}
                <div className="flex flex-col-reverse justify-between text-white/40 text-xs font-medium pb-[34px]">
                  {[0, 25, 50, 75, 100].map((val) => (
                    <span key={val} className="h-0 flex items-center">{val}</span>
                  ))}
                </div>

                {/* Chart Area */}
                <div className="relative flex-1">
                  {/* Grid Lines */}
                  {[0, 25, 50, 75, 100].map((val) => (
                    <div
                      key={val}
                      className="absolute left-0 right-0 border-t border-white/5"
                      style={{ bottom: `${(val / 100) * 280}px` }}
                    />
                  ))}

                  {/* Bars Area - Strictly for bars and scores */}
                  <div className="absolute inset-0 flex items-end justify-around px-2">
                    {filteredPerformance.map((item) => (
                      <div
                        key={item.subject}
                        className="flex flex-col items-center justify-end h-full"
                        style={{ width: '15%' }}
                      >
                        {/* Score Label */}
                        <span className="text-white font-bold text-sm mb-2 transition-transform duration-300 group-hover:scale-110">
                          {item.score}
                        </span>

                        {/* Bar - Fixed at 280px container height, aligned to bottom */}
                        <div
                          className="w-full max-w-[60px] rounded-t-xl bg-[#A3C615] transition-all duration-1000 ease-out hover:bg-[#b8e018] hover:shadow-[0_0_20px_rgba(163,198,21,0.3)]"
                          style={{
                            height: `${(item.score / 100) * 280}px`,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Separate Row for Subject Labels (Outside the Chart Container) */}
              <div className="flex justify-around mt-4 pl-12 pr-2">
                {filteredPerformance.map((item) => (
                  <span key={item.subject} className="text-white/60 text-xs font-medium tracking-wide w-[15%] text-center">
                    {item.subject}
                  </span>
                ))}
              </div>
            </section>
          )}


          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 lg:gap-5 mt-10">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-xl sm:rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-3 sm:p-4 md:p-6 text-center transition-all duration-200 hover:border-white/20 hover:shadow-lg hover:scale-[1.02]"
              >
                <item.icon className="mx-auto w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-lime-400 mb-1.5 sm:mb-2 md:mb-3" />
                <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl font-bold text-white truncate">{item.value}</h3>
                <p className="text-white/60 text-xs sm:text-sm uppercase tracking-wide mt-1">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

        </section>





        {/* Student details (read-only) */}
        <section className="rounded-xl sm:rounded-2xl md:rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 p-3 sm:p-4 md:p-6 lg:p-8 transition-all duration-200 hover:border-white/20">
          <h2 className="text-base sm:text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <User className="w-6 h-6 text-lime-400" />
            Student details
          </h2>

          {/* General information */}
          <h3 className="text-sm sm:text-base font-semibold text-white mb-2">General Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
            {[
              { label: "Full name", value: s.name || "—" },
              { label: "Student ID", value: s.admissionNumber },
              { label: "Gender", value: (s as { gender?: string }).gender ?? "—" },
              { label: "Age", value: s.age !== null ? String(s.age) : "—" },
              { label: "Date of birth", value: s.dob || "—" },
              { label: "Previous school", value: (s as { previousSchool?: string }).previousSchool || "—" },
              { label: "Class", value: s.class?.displayName ?? "—" },
              { label: "Section", value: s.class?.section || "—" },
              { label: "Status", value: (s as { status?: string }).status || "Active" },
            ].map(({ label, value }) => (
              <div key={label} className="group">
                <p className="text-white/50 text-xs sm:text-sm mb-1 uppercase tracking-wide">{label}</p>
                <p className="text-white font-medium rounded-lg sm:rounded-xl bg-white/5 border border-white/10 px-3 py-2 sm:px-4 sm:py-3 transition-colors group-hover:border-white/20 text-sm sm:text-base break-words">
                  {value || "—"}
                </p>
              </div>
            ))}
          </div>

          {/* Parent / guardian info */}
          <h3 className="text-sm sm:text-base font-semibold text-white mt-8 mb-2">Parent Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            <div className="rounded-lg sm:rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3 transition-colors hover:border-white/20 min-w-0">
              <User className="w-5 h-5 text-lime-400 shrink-0" />
              <div>
                <p className="text-white/50 text-xs">Guardian name</p>
                <p className="text-white font-medium">{s.fatherName || "—"}</p>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3 transition-colors hover:border-white/20 min-w-0">
              <Phone className="w-5 h-5 text-lime-400 shrink-0" />
              <div>
                <p className="text-white/50 text-xs">Contact</p>
                <p className="text-white font-medium">{s.phone || user?.mobile || "—"}</p>
              </div>
            </div>
          </div>

        </section>

      </main>
    </div>
    );
  }

  return (
    <>
      {content}
      {profileReportPreview ? (
        <ProfileReportTemplate
          ref={reportRef}
          data={pdfReportData ?? profileReportPreview}
        />
      ) : null}
    </>
  );
}
