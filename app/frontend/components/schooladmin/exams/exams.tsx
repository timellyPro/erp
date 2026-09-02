"use client";

import { useEffect, useState, useMemo } from "react";
import { BookOpen, Calendar, CheckCircle2, Plus, Trash2 } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import { ChevronDown } from "lucide-react";
import {
    loadExamsPage,
    peekExamsPage,
    setExamsPageCache,
} from "@/lib/loadSchoolAdminFastTabs";

interface SyllabusUnit {
    id: string;
    unitName: string;
    completedPercent: number;
    order: number;
}

interface SyllabusTracking {
    id: string;
    subject: string;
    completedPercent: number;
    units: SyllabusUnit[];
}

interface ExamSchedule {
    id: string;
    subject: string;
    examDate: string;
    startTime: string;
    durationMin: number;
}

interface TermData {
    id: string;
    name: string;
    status: "COMPLETED" | "UPCOMING" | "ONGOING";
    class: {
        id: string;
        name: string;
        section: string;
        teacher?: { name: string };
    };
    schedules: ExamSchedule[];
    syllabus: SyllabusTracking[];
}

interface ClassData {
    id: string;
    name: string;
    section: string;
}

export default function ExamsTab() {
    const [examTypes, setExamTypes] = useState<string[]>([]);
    const [examTypesLoading, setExamTypesLoading] = useState(true);
    const [newExamType, setNewExamType] = useState("");
    const [examTypeError, setExamTypeError] = useState("");
    const [examTypeSaving, setExamTypeSaving] = useState(false);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [subjectsLoading, setSubjectsLoading] = useState(true);
    const [newSubject, setNewSubject] = useState("");
    const [subjectError, setSubjectError] = useState("");
    const [subjectSaving, setSubjectSaving] = useState(false);

    const [rawData, setRawData] = useState<TermData[]>([]);
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [selectedTermName, setSelectedTermName] = useState<string>("");
    const [selectedSubject, setSelectedSubject] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [showAllSchedules, setShowAllSchedules] = useState(false);

    const updateExamsCache = (partial: Partial<{ examTypes: string[]; subjects: string[]; terms: TermData[]; classes: ClassData[] }>) => {
        setExamsPageCache({
            terms: partial.terms ?? rawData,
            classes: partial.classes ?? classes,
            examTypes: partial.examTypes ?? examTypes,
            subjects: partial.subjects ?? subjects,
        });
    };

    const deleteExamType = async (name: string) => {
        const upperName = name.trim().toUpperCase();
        if (!upperName) return;

        if (examTypes.length <= 1) {
            const confirmed = window.confirm(
                `\"${upperName}\" is the only exam type.\n\nAre you sure you want to delete it?`
            );
            if (!confirmed) return;
        } else {
            const confirmed = window.confirm(
                `Are you sure you want to delete exam type \"${upperName}\"?`
            );
            if (!confirmed) return;
        }

        setExamTypeError("");
        setExamTypeSaving(true);
        try {
            const res = await fetch(`/api/exam-types?name=${encodeURIComponent(upperName)}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setExamTypeError(
                    data?.message || "Failed to delete exam type. It may be in use."
                );
                return;
            }

            const next = examTypes.filter((type) => type.toUpperCase() !== upperName);
            setExamTypes(next);
            updateExamsCache({ examTypes: next });
        } catch (e) {
            console.error("Failed to delete exam type", e);
            setExamTypeError("Failed to delete exam type");
        } finally {
            setExamTypeSaving(false);
        }
    };

    const addExamType = async () => {
        const name = newExamType.trim().toUpperCase();
        if (!name) {
            setExamTypeError("Enter exam type name");
            return;
        }
        if (examTypes.some((t) => t.toUpperCase() === name)) {
            setExamTypeError("This exam type name already exists");
            return;
        }

        setExamTypeError("");
        setExamTypeSaving(true);
        try {
            const res = await fetch("/api/exam-types", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (res.status === 409) {
                setExamTypeError("This exam type name already exists");
                return;
            }
            if (!res.ok) {
                setExamTypeError(data?.message || "Failed to add exam type");
                return;
            }
            setNewExamType("");
            const next = Array.from(new Set([...examTypes, name])).sort();
            setExamTypes(next);
            updateExamsCache({ examTypes: next });
        } catch (e) {
            console.error("Failed to add exam type", e);
            setExamTypeError("Failed to add exam type");
        } finally {
            setExamTypeSaving(false);
        }
    };

    const deleteSubject = async (name: string) => {
        const upperName = name.trim().toUpperCase();
        if (!upperName) return;

        if (subjects.length <= 1) {
            const confirmed = window.confirm(
                `\"${upperName}\" is the only subject.\n\nAre you sure you want to delete it?`
            );
            if (!confirmed) return;
        } else {
            const confirmed = window.confirm(
                `Are you sure you want to delete subject \"${upperName}\"?`
            );
            if (!confirmed) return;
        }

        setSubjectError("");
        setSubjectSaving(true);
        try {
            const res = await fetch(`/api/exam-subjects?name=${encodeURIComponent(upperName)}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setSubjectError(
                    data?.message || "Failed to delete subject. It may be in use."
                );
                return;
            }

            const next = subjects.filter((subject) => subject.toUpperCase() !== upperName);
            setSubjects(next);
            updateExamsCache({ subjects: next });
        } catch (e) {
            console.error("Failed to delete subject", e);
            setSubjectError("Failed to delete subject");
        } finally {
            setSubjectSaving(false);
        }
    };

    const addSubject = async () => {
        const name = newSubject.trim().toUpperCase();
        if (!name) {
            setSubjectError("Enter subject name");
            return;
        }
        if (subjects.some((t) => t.toUpperCase() === name)) {
            setSubjectError("This subject name already exists");
            return;
        }

        setSubjectError("");
        setSubjectSaving(true);
        try {
            const res = await fetch("/api/exam-subjects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (res.status === 409) {
                setSubjectError("This subject name already exists");
                return;
            }
            if (!res.ok) {
                setSubjectError(data?.message || "Failed to add subject");
                return;
            }
            setNewSubject("");
            const next = Array.from(new Set([...subjects, name])).sort();
            setSubjects(next);
            updateExamsCache({ subjects: next });
        } catch (e) {
            console.error("Failed to add subject", e);
            setSubjectError("Failed to add subject");
        } finally {
            setSubjectSaving(false);
        }
    };

    useEffect(() => {
        const applyPayload = (payload: { terms: unknown[]; classes: unknown[]; examTypes: string[]; subjects: string[] }) => {
            const data = payload.terms as TermData[];
            const classData = payload.classes as ClassData[];
            setRawData(data);
            setClasses(classData);
            setExamTypes(payload.examTypes);
            setSubjects(payload.subjects);
            setExamTypesLoading(false);
            setSubjectsLoading(false);

            if (!selectedClassId && classData.length > 0) {
                setSelectedClassId(classData[0].id);
            }

            if (!selectedTermName && data.length > 0) {
                const firstUpcoming = data.find((t) => t.status === "UPCOMING");
                setSelectedTermName(firstUpcoming ? firstUpcoming.name : data[0].name);
            }
        };

        const fetchExams = async (revalidate = false) => {
            if (!revalidate) {
                const cached = peekExamsPage();
                if (cached) {
                    applyPayload(cached);
                    setLoading(false);
                    void fetchExams(true);
                    return;
                }
            }

            try {
                setLoading(rawData.length === 0);
                setExamTypesLoading(examTypes.length === 0);
                setSubjectsLoading(subjects.length === 0);
                const payload = await loadExamsPage({ revalidate });
                applyPayload(payload);
            } catch (e) {
                console.error("Fetch failed", e);
            } finally {
                setLoading(false);
                setExamTypesLoading(false);
                setSubjectsLoading(false);
            }
        };
        fetchExams();
    }, [examTypes.length, rawData.length, selectedClassId, selectedTermName, subjects.length]);

    const filteredDataByClass = useMemo(() => {
        return selectedClassId
            ? rawData.filter((t) => t.class.id === selectedClassId)
            : rawData;
    }, [rawData, selectedClassId]);

    const uniqueTerms = useMemo(() => {
        const map = new Map<string, { name: string; status: string }>();
        filteredDataByClass.forEach((t) => {
            if (!map.has(t.name)) {
                map.set(t.name, { name: t.name, status: t.status });
            }
        });
        return Array.from(map.values());
    }, [filteredDataByClass]);

    const activeTermData = useMemo(() => {
        return filteredDataByClass.filter((t) => t.name === selectedTermName);
    }, [filteredDataByClass, selectedTermName]);

    const isTermCompleted = activeTermData.every((t) => t.status === "COMPLETED");

    const activeSchedules = useMemo(() => {
        return activeTermData
            .flatMap((t) => t.schedules)
            .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
    }, [activeTermData]);

    const activeSubjects = useMemo(() => {
        return Array.from(
            new Set(activeTermData.flatMap((t) => t.syllabus.map((s) => s.subject)))
        );
    }, [activeTermData]);

    const nextExamDate = activeSchedules[0] ? new Date(activeSchedules[0].examDate) : null;
    const daysLeft = nextExamDate
        ? Math.max(0, Math.ceil((nextExamDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

    if (loading)
        return (
            <TimellyLoader
                title="Loading exams"
                steps={["Terms", "Schedules", "Subjects"]}
            />
        );

    return (
        <div className="min-h-screen text-white max-w-7xl mx-auto md:p-0">
            <PageHeader
                title={
                    <div className="flex items-center gap-3">
                        <span>Exams & Syllabus</span>
                        <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase ${isTermCompleted ? "bg-white/20 text-white" : "bg-[#B4F42A] text-black"
                                }`}
                        >
                            {isTermCompleted ? "Completed" : "Active Term"}
                        </span>
                    </div>
                }
                subtitle={`Viewing details for ${selectedTermName}`}
                rightSlot={
                    <div className="flex gap-2 md:gap-6">
                        <div className="text-right md:text-center border-r border-white/10 pr-6 text-white/40">
                            <p className="text-xs">Next Exam</p>
                            <p className="text-sm font-bold text-white">
                                {nextExamDate
                                    ? nextExamDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                    : "--"}
                            </p>
                        </div>
                        <div className="text-right md:text-center">
                            <p className="text-xs">Days Left</p>
                            <p className="text-sm font-bold text-[#B4F42A]">{daysLeft}</p>
                        </div>
                    </div>
                }
                className="somu border-none bg-white/5! mb-6"
            />

            {/* EXAM TYPES MANAGER */}
            <div className="somu border-none bg-white/5! rounded-3xl p-5 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold">Exam Types</h3>
                        <p className="text-xs text-white/50">CAPS only. Duplicate names are not allowed.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <input
                            value={newExamType}
                            onChange={(e) => setNewExamType(e.target.value.toUpperCase())}
                            placeholder="e.g. HALF YEARLY, MID 1"
                            className="px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
                        />
                        <button
                            type="button"
                            onClick={addExamType}
                            disabled={examTypeSaving}
                            className="px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            <Plus size={16} />
                            {examTypeSaving ? "Saving..." : "Add"}
                        </button>
                    </div>
                </div>

                {examTypeError && (
                    <p className="mt-2 text-xs font-bold text-red-400">{examTypeError}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                    {examTypesLoading ? (
                        <span className="text-xs text-white/50">Loading exam types...</span>
                    ) : examTypes.length === 0 ? (
                        <span className="text-xs text-white/50">No exam types found.</span>
                    ) : (
                        examTypes.map((t) => (
                            <div
                                key={t}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white/80"
                            >
                                <span>{t}</span>
                                <button
                                    type="button"
                                    disabled={examTypeSaving}
                                    onClick={() => deleteExamType(t)}
                                    className="ml-1 inline-flex items-center justify-center rounded-full p-0.5 hover:bg-red-500/20 disabled:opacity-50"
                                    title="Delete exam type"
                                >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* SUBJECTS MANAGER */}
            <div className="somu border-none bg-white/5! rounded-3xl p-5 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold">Subjects</h3>
                        <p className="text-xs text-white/50">CAPS only. Duplicate names are not allowed.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <input
                            value={newSubject}
                            onChange={(e) => setNewSubject(e.target.value.toUpperCase())}
                            placeholder="e.g. MATHEMATICS, SCIENCE"
                            className="px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
                        />
                        <button
                            type="button"
                            onClick={addSubject}
                            disabled={subjectSaving}
                            className="px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            <Plus size={16} />
                            {subjectSaving ? "Saving..." : "Add"}
                        </button>
                    </div>
                </div>

                {subjectError && (
                    <p className="mt-2 text-xs font-bold text-red-400">{subjectError}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                    {subjectsLoading ? (
                        <span className="text-xs text-white/50">Loading subjects...</span>
                    ) : subjects.length === 0 ? (
                        <span className="text-xs text-white/50">No subjects found.</span>
                    ) : (
                        subjects.map((t) => (
                            <div
                                key={t}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white/80"
                            >
                                <span>{t}</span>
                                <button
                                    type="button"
                                    disabled={subjectSaving}
                                    onClick={() => deleteSubject(t)}
                                    className="ml-1 inline-flex items-center justify-center rounded-full p-0.5 hover:bg-red-500/20 disabled:opacity-50"
                                    title="Delete subject"
                                >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    {/* CLASS DROPDOWN */}
                    <div className="mb-4 relative">
                        <label className="text-xs text-white/60 mb-1 block font-bold">Select Class</label>

                        <div className="relative">
                            <select
                                value={selectedClassId ?? ""}
                                onChange={(e) => {
                                    const id = e.target.value || null;
                                    setSelectedClassId(id);
                                    setSelectedTermName(""); // reset term selection
                                    setSelectedSubject("all");
                                }}
                                className="w-full p-2 pl-4 pr-10 rounded-2xl border transition-all text-white  border-gray-600 hover:bg-gray-700 focus:ring-1 focus:ring-[#B4F42A]/50 focus:border-[#B4F42A]/50 outline-none appearance-none"
                            >
                                <option className="bg-gray-800 text-white" value="">All Classes</option>
                                {classes.map((cls) => (
                                    <option className="bg-gray-800 text-white" key={cls.id} value={cls.id}>
                                        {cls.name} {cls.section}
                                    </option>
                                ))}
                            </select>

                            {/* Dropdown icon */}
                            
                            <ChevronDown
                                size={20}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none"
                            />
                        </div>
                    </div>


                    {/* TERMS LIST */}
                    <div className="flex flex-col gap-3 mt-4">
                        {uniqueTerms.map((term) => (
                            <button
                                key={term.name}
                                onClick={() => {
                                    setSelectedTermName(term.name);
                                    setSelectedSubject("all");
                                    setShowAllSchedules(false);
                                }}
                                className={`p-2 pl-4 rounded-2xl text-left transition-all border ${selectedTermName === term.name
                                    ? "border-[#B4F42A]/50 bg-white/10 ring-1 ring-[#B4F42A]/20"
                                    : "border-white/5 bg-white/5 hover:bg-white/10"
                                    }`}
                            >
                                <p className="font-bold text-[12px] capitalize">{term.name} Examination</p>
                                <span
                                    className={`text-[10px] font-bold uppercase tracking-wider ${term.status === "UPCOMING" ? "text-[#B4F42A]" : "text-white/40"
                                        }`}
                                >
                                    {term.status}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* SCHEDULE */}
                    <div className="somu rounded-3xl p-5 border-none mt-4">
                        <h3 className="font-bold mb-4 flex items-center gap-2 text-white/80">
                            <Calendar size={16} className="text-[#B4F42A]" /> Schedule
                        </h3>
                        <div className="space-y-3">
                            {(showAllSchedules ? activeSchedules : activeSchedules.slice(0, 2)).map((exam) => (
                                <div
                                    key={exam.id}
                                    className="bg-white/5 p-4 rounded-2xl flex items-center gap-4 border border-white/5"
                                >
                                    <div className="text-center border-r border-white/10 pr-3">
                                        <p className="text-lg font-bold leading-tight">{new Date(exam.examDate).getDate()}</p>
                                        <p className="text-[9px] text-white/40 uppercase">
                                            {new Date(exam.examDate).toLocaleString("default", { month: "short" })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-bold capitalize text-sm">{exam.subject}</p>
                                        <p className="text-[10px] text-white/40">{exam.startTime}</p>
                                    </div>
                                </div>
                            ))}
                            {activeSchedules.length > 2 && (
                                <button
                                    onClick={() => setShowAllSchedules(!showAllSchedules)}
                                    className="w-full text-center text-[#B4F42A] text-xs font-bold pt-1 hover:underline transition-all"
                                >
                                    {showAllSchedules ? "Show less" : "View all"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDE: SUBJECTS & SYLLABUS */}
                <div className="lg:col-span-9 space-y-6">
                    {isTermCompleted ? (
                        <div className="somu rounded-3xl p-12 border-none flex flex-col items-center justify-center text-center">
                            <div className="bg-white/5 p-6 rounded-full mb-4">
                                <CheckCircle2 size={48} className="text-[#B4F42A]" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Examination Completed</h2>
                            <p className="text-white/40 max-w-xs">
                                All syllabus and exams for {selectedTermName} have been concluded.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* SUBJECT FILTER */}
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                <button
                                    onClick={() => setSelectedSubject("all")}
                                    className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedSubject === "all" ? "bg-[#B4F42A] text-black" : "somu border-none"
                                        }`}
                                >
                                    All Subjects
                                </button>
                                {activeSubjects.map((sub) => (
                                    <button
                                        key={sub}
                                        onClick={() => setSelectedSubject(sub)}
                                        className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all capitalize ${selectedSubject === sub ? "bg-[#B4F42A] text-black" : "somu border-none"
                                            }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>

                            {/* SYLLABUS ITEMS */}
                            {(selectedSubject === "all" ? activeSubjects : [selectedSubject]).map((subName) => {
                                const syllabusItem = activeTermData.flatMap((t) => t.syllabus).find((s) => s.subject === subName);
                                if (!syllabusItem) return null;

                                const unitCount = syllabusItem.units.length;
                                const calculatedProgress = unitCount > 0
                                    ? Math.round(syllabusItem.units.reduce((acc, u) => acc + u.completedPercent, 0) / unitCount)
                                    : syllabusItem.completedPercent;

                                return (
                                    <div key={subName} className="somu rounded-3xl p-6 md:p-8 border-none mb-6">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-white/10 p-3 rounded-2xl">
                                                    <BookOpen className="text-[#B4F42A]" size={24} />
                                                </div>
                                                <div>
                                                    <h2 className="text-xl font-bold capitalize">{subName}</h2>
                                                    {activeTermData[0]?.class?.teacher?.name && (
                                                        <div className="flex items-center gap-2 text-white/40 text-xs">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                                                            <span>{activeTermData[0].class.teacher.name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="w-full md:w-auto">
                                                <div className="flex justify-between md:justify-end items-center gap-3 mb-2">
                                                    <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">
                                                        Completion
                                                    </span>
                                                    <span className="text-lg font-bold">{calculatedProgress}%</span>
                                                </div>
                                                <div className="w-full md:w-40 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-[#B4F42A] h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${calculatedProgress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {syllabusItem.units.map((unit) => (
                                                <div
                                                    key={unit.id}
                                                    className="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={`w-2 h-2 rounded-full ${unit.completedPercent === 100 ? "bg-[#B4F42A]" : "bg-blue-400"
                                                                }`}
                                                        />
                                                        <span className="text-sm font-medium text-white/90">{unit.unitName}</span>
                                                    </div>
                                                    {unit.completedPercent === 100 ? (
                                                        <div className="flex items-center gap-1.5 bg-[#B4F42A]/10 px-3 py-1 rounded-lg border border-[#B4F42A]/20">
                                                            <CheckCircle2 size={12} className="text-[#B4F42A]" />
                                                            <span className="text-[10px] font-bold text-[#B4F42A] uppercase">Done</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[10px] font-bold text-white/30 uppercase">
                                                                {unit.completedPercent}%
                                                            </span>
                                                            <div className="w-10 h-1 bg-white/10 rounded-full overflow-hidden">
                                                                <div className="bg-blue-400 h-full" style={{ width: `${unit.completedPercent}%` }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
