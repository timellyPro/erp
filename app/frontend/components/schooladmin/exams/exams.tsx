"use client";

import { useEffect, useState, useMemo } from "react";
import { BookOpen, Calendar, CheckCircle2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import TimellyLoader from "../../common/TimellyLoader";
import { ChevronDown } from "lucide-react";
import {
    loadExamsPage,
    peekExamsPage,
    setExamsPageCache,
    invalidateExamsPage,
} from "@/lib/loadSchoolAdminFastTabs";
import type { ExamTypeOption } from "@/lib/examTypes";

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
    const [examTypes, setExamTypes] = useState<ExamTypeOption[]>([]);
    const [examTypesLoading, setExamTypesLoading] = useState(true);
    const [newExamType, setNewExamType] = useState("");
    const [newExamTypeMax, setNewExamTypeMax] = useState("");
    const [examTypeError, setExamTypeError] = useState("");
    const [examTypeSaving, setExamTypeSaving] = useState(false);
    const [maxMarksDrafts, setMaxMarksDrafts] = useState<Record<string, string>>({});
    const [sectionDraftsByType, setSectionDraftsByType] = useState<
        Record<string, Array<{ id?: string; name: string; maxMarks: string }>>
    >({});
    const [sectionSaving, setSectionSaving] = useState(false);
    const [sectionError, setSectionError] = useState("");
    const [subjectMaxByExam, setSubjectMaxByExam] = useState<Record<string, string>>({});
    const [subjectPartsByKey, setSubjectPartsByKey] = useState<
        Record<string, Array<{ name: string; maxMarks: string }>>
    >({});
    const [subjectConfigSavingFor, setSubjectConfigSavingFor] = useState<string | null>(null);
    const [subjectConfigMessage, setSubjectConfigMessage] = useState("");
    const [openExamType, setOpenExamType] = useState<string | null>(null);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [subjectsLoading, setSubjectsLoading] = useState(true);
    const [newSubject, setNewSubject] = useState("");
    const [subjectError, setSubjectError] = useState("");
    const [subjectSaving, setSubjectSaving] = useState(false);
    const [editingSubject, setEditingSubject] = useState<string | null>(null);
    const [editingSubjectValue, setEditingSubjectValue] = useState("");

    const [rawData, setRawData] = useState<TermData[]>([]);
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [selectedTermName, setSelectedTermName] = useState<string>("");
    const [selectedSubject, setSelectedSubject] = useState<string>("all");
    const [loading, setLoading] = useState(true);
    const [showAllSchedules, setShowAllSchedules] = useState(false);

    const updateExamsCache = (partial: Partial<{
        examTypes: ExamTypeOption[];
        subjects: string[];
        terms: TermData[];
        classes: ClassData[];
    }>) => {
        setExamsPageCache({
            terms: partial.terms ?? rawData,
            classes: partial.classes ?? classes,
            examTypes: partial.examTypes ?? examTypes,
            subjects: partial.subjects ?? subjects,
        });
    };

    const syncMaxDrafts = (types: ExamTypeOption[]) => {
        const next: Record<string, string> = {};
        const nextSections: Record<string, Array<{ id?: string; name: string; maxMarks: string }>> = {};
        types.forEach((t) => {
            next[t.name] = t.maxMarks != null ? String(t.maxMarks) : "";
            nextSections[t.name] = (t.sections ?? []).map((s) => ({
                id: s.id,
                name: s.name,
                maxMarks: String(s.maxMarks),
            }));
        });
        setMaxMarksDrafts(next);
        setSectionDraftsByType(nextSections);
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

            const next = examTypes.filter((type) => type.name.toUpperCase() !== upperName);
            setExamTypes(next);
            syncMaxDrafts(next);
            updateExamsCache({ examTypes: next });
        } catch (e) {
            console.error("Failed to delete exam type", e);
            setExamTypeError("Failed to delete exam type");
        } finally {
            setExamTypeSaving(false);
        }
    };

    const saveExamTypeMaxMarks = async (name: string) => {
        const upperName = name.trim().toUpperCase();
        const raw = maxMarksDrafts[upperName] ?? "";
        const maxMarks = raw.trim() === "" ? null : Number(raw);
        if (raw.trim() !== "" && (!Number.isFinite(maxMarks) || (maxMarks as number) <= 0)) {
            setExamTypeError("Max marks must be a positive number");
            return;
        }

        setExamTypeError("");
        setExamTypeSaving(true);
        try {
            const res = await fetch("/api/exam-types", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: upperName, maxMarks }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setExamTypeError(data?.message || "Failed to update max marks");
                return;
            }
            const updatedMax = data?.examType?.maxMarks ?? maxMarks;
            let next = examTypes.map((t) =>
                t.name === upperName ? { ...t, maxMarks: updatedMax } : t
            );
            if (!next.some((t) => t.name === upperName) && data?.examType) {
                next = [
                    ...next,
                    { name: data.examType.name, maxMarks: data.examType.maxMarks ?? null, sections: data.examType.sections ?? [] },
                ].sort((a, b) => a.name.localeCompare(b.name));
            }
            setExamTypes(next);
            syncMaxDrafts(next);
            updateExamsCache({ examTypes: next });
        } catch (e) {
            console.error("Failed to update max marks", e);
            setExamTypeError("Failed to update max marks");
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
        if (examTypes.some((t) => t.name.toUpperCase() === name)) {
            setExamTypeError("This exam type name already exists");
            return;
        }

        const maxRaw = newExamTypeMax.trim();
        const maxMarks = maxRaw === "" ? null : Number(maxRaw);
        if (maxRaw !== "" && (!Number.isFinite(maxMarks) || (maxMarks as number) <= 0)) {
            setExamTypeError("Max marks must be a positive number");
            return;
        }

        setExamTypeError("");
        setExamTypeSaving(true);
        try {
            const res = await fetch("/api/exam-types", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name, maxMarks }),
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
            setNewExamTypeMax("");
            const created: ExamTypeOption = {
                name: data?.examType?.name ?? name,
                maxMarks: data?.examType?.maxMarks ?? maxMarks,
                sections: Array.isArray(data?.examType?.sections) ? data.examType.sections : [],
                subjectConfigs: [],
            };
            const next = [...examTypes.filter((t) => t.name !== created.name), created].sort(
                (a, b) => a.name.localeCompare(b.name)
            );
            setExamTypes(next);
            syncMaxDrafts(next);
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

        const confirmed = window.confirm(
            `Remove \"${upperName}\" from the subjects list?\n\nExisting marks are not deleted.`
        );
        if (!confirmed) return;

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
                    data?.message || "Failed to delete subject."
                );
                return;
            }

            const next = subjects.filter((subject) => subject.toUpperCase() !== upperName);
            setSubjects(next);
            updateExamsCache({ subjects: next });
            if (editingSubject === upperName) {
                setEditingSubject(null);
                setEditingSubjectValue("");
            }
        } catch (e) {
            console.error("Failed to delete subject", e);
            setSubjectError("Failed to delete subject");
        } finally {
            setSubjectSaving(false);
        }
    };

    const renameSubject = async (from: string) => {
        const fromName = from.trim().toUpperCase();
        const toName = editingSubjectValue.trim().toUpperCase();
        if (!fromName || !toName) {
            setSubjectError("Enter a subject name");
            return;
        }
        if (fromName === toName) {
            setEditingSubject(null);
            setEditingSubjectValue("");
            return;
        }
        if (subjects.some((s) => s.toUpperCase() === toName && s.toUpperCase() !== fromName)) {
            setSubjectError("This subject name already exists");
            return;
        }

        setSubjectError("");
        setSubjectSaving(true);
        try {
            const res = await fetch("/api/exam-subjects", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ from: fromName, to: toName }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSubjectError(data?.message || "Failed to rename subject");
                return;
            }
            const next = Array.from(
                new Set(subjects.map((s) => (s.toUpperCase() === fromName ? toName : s)))
            ).sort();
            setSubjects(next);
            updateExamsCache({ subjects: next });
            setEditingSubject(null);
            setEditingSubjectValue("");
        } catch (e) {
            console.error("Failed to rename subject", e);
            setSubjectError("Failed to rename subject");
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
        const applyPayload = (payload: {
            terms: unknown[];
            classes: unknown[];
            examTypes: ExamTypeOption[];
            subjects: string[];
        }) => {
            const data = payload.terms as TermData[];
            const classData = payload.classes as ClassData[];
            setRawData(data);
            setClasses(classData);
            setExamTypes(payload.examTypes);
            syncMaxDrafts(payload.examTypes);
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
                invalidateExamsPage();
                const message = e instanceof Error ? e.message : "Failed to load exams";
                setExamTypeError(message);
                setSubjectError(message);
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

    const saveExamTypeSections = async (examTypeName: string) => {
        const upper = examTypeName.trim().toUpperCase();
        const drafts = sectionDraftsByType[upper] ?? [];
        for (const row of drafts) {
            if (!row.name.trim()) {
                setSectionError("Each subsection needs a name");
                return;
            }
            const n = Number(row.maxMarks);
            if (!Number.isFinite(n) || n <= 0) {
                setSectionError(`"${row.name}": max marks must be a positive number`);
                return;
            }
        }
        setSectionError("");
        setSectionSaving(true);
        try {
            const res = await fetch("/api/exam-types/sections", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: upper,
                    sections: drafts.map((s, i) => ({
                        name: s.name.trim(),
                        maxMarks: Number(s.maxMarks),
                        order: i,
                    })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSectionError(data?.message || "Failed to save subsections");
                return;
            }
            const et = data?.examType;
            const sections = Array.isArray(et?.sections) ? et.sections : [];
            const next = examTypes.map((t) =>
                t.name === upper
                    ? {
                          ...t,
                          maxMarks: et?.maxMarks ?? (sections.length
                              ? sections.reduce((a: number, s: { maxMarks: number }) => a + s.maxMarks, 0)
                              : t.maxMarks),
                          sections,
                      }
                    : t
            );
            if (!next.some((t) => t.name === upper) && et) {
                next.push({
                    name: et.name,
                    maxMarks: et.maxMarks ?? null,
                    sections,
                });
                next.sort((a, b) => a.name.localeCompare(b.name));
            }
            setExamTypes(next);
            syncMaxDrafts(next);
            updateExamsCache({ examTypes: next });
        } catch (e) {
            console.error(e);
            setSectionError("Failed to save subsections");
        } finally {
            setSectionSaving(false);
        }
    };

    const subjectMaxKey = (examTypeName: string, subjectName: string) =>
        `${examTypeName.trim().toUpperCase()}::${subjectName.trim().toUpperCase()}`;

    useEffect(() => {
        setSubjectMaxByExam((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const exam of examTypes) {
                for (const subject of subjects) {
                    const key = subjectMaxKey(exam.name, subject);
                    if (key in next) continue;
                    const saved = exam.subjectConfigs?.find(
                        (c) => c.subject === subject.trim().toUpperCase()
                    );
                    next[key] =
                        saved?.sections?.length
                            ? String(saved.sections.reduce((a, s) => a + s.maxMarks, 0))
                            : saved?.maxMarks != null
                              ? String(saved.maxMarks)
                              : "";
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        setSubjectPartsByKey((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const exam of examTypes) {
                for (const subject of subjects) {
                    const key = subjectMaxKey(exam.name, subject);
                    if (key in next) continue;
                    const saved = exam.subjectConfigs?.find(
                        (c) => c.subject === subject.trim().toUpperCase()
                    );
                    next[key] = (saved?.sections ?? []).map((s) => ({
                        name: s.name,
                        maxMarks: String(s.maxMarks),
                    }));
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [examTypes, subjects]);

    const saveSubjectMax = async (examTypeName: string, subjectName: string) => {
        const upper = examTypeName.trim().toUpperCase();
        const subject = subjectName.trim().toUpperCase();
        const key = subjectMaxKey(upper, subject);
        const exam = examTypes.find((t) => t.name === upper);
        const already = exam?.subjectConfigs?.find((c) => c.subject === subject);
        if (already && already.sections.length > 0) {
            setSubjectConfigMessage(
                `${subject} under ${upper} uses subsection max marks. Those were not changed.`
            );
            return;
        }
        const maxRaw = (subjectMaxByExam[key] ?? "").trim();
        const maxMarks = Number(maxRaw);
        if (!maxRaw || !Number.isFinite(maxMarks) || maxMarks <= 0) {
            setSubjectConfigMessage(`Set max marks for ${subject}`);
            return;
        }
        if (already?.maxMarks != null && Number(already.maxMarks) === maxMarks) {
            setSubjectConfigMessage(`${subject} already has max marks ${maxMarks} for ${upper}.`);
            return;
        }

        setSubjectConfigMessage("");
        setSubjectConfigSavingFor(key);
        try {
            const res = await fetch("/api/exam-types/subject-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    examType: upper,
                    subject,
                    maxMarks,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSubjectConfigMessage(data?.message || "Failed to save max marks");
                return;
            }
            const saved = data?.subjectConfig;
            if (!saved?.subject) {
                setSubjectConfigMessage(data?.message || "Failed to save max marks");
                return;
            }
            const next = examTypes.map((t) => {
                if (t.name !== upper) return t;
                const configs = [...(t.subjectConfigs ?? [])];
                const idx = configs.findIndex((c) => c.subject === saved.subject);
                const row = {
                    subject: saved.subject as string,
                    maxMarks: (saved.maxMarks ?? null) as number | null,
                    sections: Array.isArray(saved.sections) ? saved.sections : already?.sections ?? [],
                };
                if (idx >= 0) configs[idx] = row;
                else configs.push(row);
                configs.sort((a, b) => a.subject.localeCompare(b.subject));
                return { ...t, subjectConfigs: configs };
            });
            setExamTypes(next);
            updateExamsCache({ examTypes: next });
            setSubjectMaxByExam((prev) => ({
                ...prev,
                [key]: saved.maxMarks != null ? String(saved.maxMarks) : maxRaw,
            }));
            setSubjectConfigMessage(
                data?.unchanged
                    ? data.message
                    : `Saved ${saved.subject} max marks for ${upper}`
            );
        } catch (e) {
            console.error(e);
            setSubjectConfigMessage("Failed to save max marks");
        } finally {
            setSubjectConfigSavingFor(null);
        }
    };

    const saveSubjectParts = async (examTypeName: string, subjectName: string) => {
        const upper = examTypeName.trim().toUpperCase();
        const subject = subjectName.trim().toUpperCase();
        const key = subjectMaxKey(upper, subject);
        const drafts = subjectPartsByKey[key] ?? [];
        if (drafts.length === 0) {
            const exam = examTypes.find((t) => t.name === upper);
            const already = exam?.subjectConfigs?.find((c) => c.subject === subject);
            if (!already || already.sections.length === 0) {
                await saveSubjectMax(upper, subject);
                return;
            }
            const maxRaw = (subjectMaxByExam[key] ?? "").trim();
            const maxMarks = Number(maxRaw);
            if (!maxRaw || !Number.isFinite(maxMarks) || maxMarks <= 0) {
                setSubjectConfigMessage(`Set max marks for ${subject}, or add Written / Viva parts`);
                return;
            }
            setSubjectConfigMessage("");
            setSubjectConfigSavingFor(key);
            try {
                const res = await fetch("/api/exam-types/subject-config", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ examType: upper, subject, maxMarks, sections: [] }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setSubjectConfigMessage(data?.message || "Failed to save max marks");
                    return;
                }
                const saved = data?.subjectConfig;
                if (!saved?.subject) {
                    setSubjectConfigMessage(data?.message || "Failed to save max marks");
                    return;
                }
                const next = examTypes.map((t) => {
                    if (t.name !== upper) return t;
                    const configs = [...(t.subjectConfigs ?? [])];
                    const idx = configs.findIndex((c) => c.subject === saved.subject);
                    const row = {
                        subject: saved.subject as string,
                        maxMarks: (saved.maxMarks ?? null) as number | null,
                        sections: [] as typeof already.sections,
                    };
                    if (idx >= 0) configs[idx] = row;
                    else configs.push(row);
                    return { ...t, subjectConfigs: configs };
                });
                setExamTypes(next);
                updateExamsCache({ examTypes: next });
                setSubjectConfigMessage(`Saved ${saved.subject} max marks for ${upper}`);
            } catch (e) {
                console.error(e);
                setSubjectConfigMessage("Failed to save max marks");
            } finally {
                setSubjectConfigSavingFor(null);
            }
            return;
        }
        for (const row of drafts) {
            if (!row.name.trim()) {
                setSubjectConfigMessage(`Each part of ${subject} needs a name, such as Written or Viva`);
                return;
            }
            const n = Number(row.maxMarks);
            if (!Number.isFinite(n) || n <= 0) {
                setSubjectConfigMessage(`"${row.name || "Part"}" needs marks`);
                return;
            }
        }
        const exam = examTypes.find((t) => t.name === upper);
        const already = exam?.subjectConfigs?.find((c) => c.subject === subject);
        const same =
            already &&
            already.sections.length === drafts.length &&
            drafts.every((row, i) => {
                const saved = already.sections[i];
                return (
                    saved &&
                    saved.name.trim().toUpperCase() === row.name.trim().toUpperCase() &&
                    Number(saved.maxMarks) === Number(row.maxMarks)
                );
            });
        if (same) {
            setSubjectConfigMessage(`${subject} parts for ${upper} are already saved.`);
            return;
        }

        setSubjectConfigMessage("");
        setSubjectConfigSavingFor(key);
        try {
            const res = await fetch("/api/exam-types/subject-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    examType: upper,
                    subject,
                    sections: drafts.map((row, i) => ({
                        name: row.name.trim(),
                        maxMarks: Number(row.maxMarks),
                        order: i,
                    })),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSubjectConfigMessage(data?.message || "Failed to save subject parts");
                return;
            }
            const saved = data?.subjectConfig;
            if (!saved?.subject) {
                setSubjectConfigMessage(data?.message || "Failed to save subject parts");
                return;
            }
            const sections = Array.isArray(saved.sections) ? saved.sections : [];
            const next = examTypes.map((t) => {
                if (t.name !== upper) return t;
                const configs = [...(t.subjectConfigs ?? [])];
                const idx = configs.findIndex((c) => c.subject === saved.subject);
                const row = {
                    subject: saved.subject as string,
                    maxMarks: (saved.maxMarks ?? null) as number | null,
                    sections,
                };
                if (idx >= 0) configs[idx] = row;
                else configs.push(row);
                configs.sort((a, b) => a.subject.localeCompare(b.subject));
                return { ...t, subjectConfigs: configs };
            });
            setExamTypes(next);
            updateExamsCache({ examTypes: next });
            setSubjectPartsByKey((prev) => ({
                ...prev,
                [key]: sections.map((s: { name: string; maxMarks: number }) => ({
                    name: s.name,
                    maxMarks: String(s.maxMarks),
                })),
            }));
            setSubjectConfigMessage(
                data?.unchanged
                    ? data.message
                    : `Saved ${saved.subject} for ${upper}`
            );
        } catch (e) {
            console.error(e);
            setSubjectConfigMessage("Failed to save subject parts");
        } finally {
            setSubjectConfigSavingFor(null);
        }
    };

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
        <div className="min-h-screen text-white max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-8">
            <PageHeader
                title={
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                        <span className="truncate">Exams & Syllabus</span>
                        <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase shrink-0 ${isTermCompleted ? "bg-white/20 text-white" : "bg-[#B4F42A] text-black"
                                }`}
                        >
                            {isTermCompleted ? "Completed" : "Active Term"}
                        </span>
                    </div>
                }
                subtitle={`Viewing details for ${selectedTermName}`}
                rightSlot={
                    <div className="flex gap-4 sm:gap-6 justify-between sm:justify-end w-full md:w-auto">
                        <div className="text-left sm:text-right md:text-center border-r border-white/10 pr-4 sm:pr-6 text-white/40">
                            <p className="text-xs">Next Exam</p>
                            <p className="text-sm font-bold text-white">
                                {nextExamDate
                                    ? nextExamDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                    : "--"}
                            </p>
                        </div>
                        <div className="text-left sm:text-right md:text-center">
                            <p className="text-xs">Days Left</p>
                            <p className="text-sm font-bold text-[#B4F42A]">{daysLeft}</p>
                        </div>
                    </div>
                }
                className="somu border-none bg-white/5! mb-4 sm:mb-6"
            />

            {/* EXAM TYPES MANAGER */}
            <div className="somu border-none bg-white/5! rounded-2xl sm:rounded-3xl p-4 sm:p-5 mb-4 sm:mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-base sm:text-lg font-bold">Exam Types</h3>
                        <p className="text-xs text-white/50">
                            Exam types have no max marks. Each subject under an exam type has max marks, and parts such as Written and Viva.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full md:w-auto">
                        <input
                            value={newExamType}
                            onChange={(e) => setNewExamType(e.target.value.toUpperCase())}
                            placeholder="e.g. HALF YEARLY"
                            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
                        />
                        <button
                            type="button"
                            onClick={addExamType}
                            disabled={examTypeSaving}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            <Plus size={16} />
                            {examTypeSaving ? "Saving..." : "Add"}
                        </button>
                    </div>
                </div>

                {examTypeError && (
                    <p className="mt-2 text-xs font-bold text-red-400">{examTypeError}</p>
                )}

                <div className="mt-4 flex flex-col gap-3">
                    {examTypesLoading ? (
                        <span className="text-xs text-white/50">Loading exam types...</span>
                    ) : examTypes.length === 0 ? (
                        <span className="text-xs text-white/50">
                            {examTypeError ? "Exam types could not be loaded." : "No exam types found."}
                        </span>
                    ) : (
                        examTypes.map((t) => {
                            const examOpen = openExamType === t.name;
                            return (
                                <div
                                    key={t.name}
                                    className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
                                >
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white/80">
                                        <button
                                            type="button"
                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
                                            aria-expanded={examOpen}
                                            aria-label={examOpen ? `Hide subjects for ${t.name}` : `Show subjects for ${t.name}`}
                                            onClick={() =>
                                                setOpenExamType((current) => (current === t.name ? null : t.name))
                                            }
                                        >
                                            <ChevronDown
                                                size={16}
                                                className={`text-white/70 transition-transform ${examOpen ? "rotate-180" : ""}`}
                                            />
                                        </button>
                                        <span className="min-w-0 flex-1 text-left">
                                            <span className="block truncate">{t.name}</span>
                                            <span className="block truncate text-[10px] font-medium text-white/40">
                                                {(t.subjectConfigs?.length ?? 0) > 0
                                                    ? `${t.subjectConfigs?.length} subjects set`
                                                    : "Tap to set subject marks"}
                                            </span>
                                        </span>
                                        <span className="hidden shrink-0 text-[10px] font-medium text-white/40">
                                            {(t.subjectConfigs?.length ?? 0) > 0
                                                ? `${t.subjectConfigs?.length} subjects set`
                                                : "No subject marks yet"}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={examTypeSaving}
                                            onClick={() => deleteExamType(t.name)}
                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-red-500/20 disabled:opacity-50"
                                            title="Delete exam type"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                    </div>
                                    <div className={`${examOpen ? "block" : "hidden"} border-t border-white/10 px-3 py-3 space-y-2`}>
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                                            Subjects for {t.name}
                                        </p>
                                        {subjects.length === 0 ? (
                                            <p className="text-[10px] text-white/40">Add subjects first, then set max marks for each one.</p>
                                        ) : (
                                            subjects.map((subjectName) => {
                                                const subjectKey = subjectName.trim().toUpperCase();
                                                const rowKey = subjectMaxKey(t.name, subjectKey);
                                                const parts = subjectPartsByKey[rowKey] ?? [];
                                                const partSum = parts.reduce((a, row) => {
                                                    const n = Number(row.maxMarks);
                                                    return a + (Number.isFinite(n) ? n : 0);
                                                }, 0);
                                                const saving = subjectConfigSavingFor === rowKey;
                                                return (
                                                    <div key={subjectKey} className="rounded-xl bg-black/25 px-3 py-2.5 space-y-2">
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                            <span className="min-w-0 break-words text-xs font-bold text-white sm:min-w-32">{subjectKey}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/40">Max</span>
                                                                {parts.length > 0 ? (
                                                                    <span className="text-xs font-bold text-[#B4F42A]">{partSum}</span>
                                                                ) : (
                                                                    <input
                                                                        value={subjectMaxByExam[rowKey] ?? ""}
                                                                        onChange={(e) =>
                                                                            setSubjectMaxByExam((prev) => ({
                                                                                ...prev,
                                                                                [rowKey]: e.target.value.replace(/[^\d.]/g, ""),
                                                                            }))
                                                                        }
                                                                        placeholder="Max marks"
                                                                        inputMode="decimal"
                                                                        disabled={saving}
                                                                        className="w-24 sm:w-20 px-2 py-2 sm:py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50 disabled:opacity-60"
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                        {parts.map((row, idx) => (
                                                            <div key={idx} className="flex gap-2 items-center">
                                                                <input
                                                                    value={row.name}
                                                                    onChange={(e) =>
                                                                        setSubjectPartsByKey((prev) => ({
                                                                            ...prev,
                                                                            [rowKey]: (prev[rowKey] ?? []).map((r, i) =>
                                                                                i === idx ? { ...r, name: e.target.value } : r
                                                                            ),
                                                                        }))
                                                                    }
                                                                    placeholder="e.g. Written, Viva"
                                                                    className="min-w-0 flex-1 px-3 py-2 sm:py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50"
                                                                />
                                                                <input
                                                                    value={row.maxMarks}
                                                                    onChange={(e) =>
                                                                        setSubjectPartsByKey((prev) => ({
                                                                            ...prev,
                                                                            [rowKey]: (prev[rowKey] ?? []).map((r, i) =>
                                                                                i === idx
                                                                                    ? { ...r, maxMarks: e.target.value.replace(/[^\d.]/g, "") }
                                                                                    : r
                                                                            ),
                                                                        }))
                                                                    }
                                                                    placeholder="Marks"
                                                                    inputMode="decimal"
                                                                    className="w-16 shrink-0 px-2 py-2 sm:py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-[#B4F42A]/50"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setSubjectPartsByKey((prev) => ({
                                                                            ...prev,
                                                                            [rowKey]: (prev[rowKey] ?? []).filter((_, i) => i !== idx),
                                                                        }))
                                                                    }
                                                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-red-500/20"
                                                                    aria-label="Remove part"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <div className="grid grid-cols-2 gap-2 sm:flex">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setSubjectPartsByKey((prev) => ({
                                                                        ...prev,
                                                                        [rowKey]: [...(prev[rowKey] ?? []), { name: "", maxMarks: "" }],
                                                                    }))
                                                                }
                                                                className="min-h-10 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold text-white/80 inline-flex items-center justify-center gap-1 sm:min-h-0 sm:w-auto sm:py-1.5"
                                                            >
                                                                <Plus size={12} /> Written / Viva
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={saving}
                                                                onClick={() => saveSubjectParts(t.name, subjectKey)}
                                                                className="min-h-10 px-2.5 py-2 rounded-xl bg-[#B4F42A]/20 text-[#B4F42A] border border-[#B4F42A]/30 text-[10px] font-bold disabled:opacity-50 sm:min-h-0 sm:w-auto sm:py-1.5"
                                                            >
                                                                {saving ? "Saving..." : "Save"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                {sectionError && (
                    <p className="mt-2 text-xs font-bold text-red-400">{sectionError}</p>
                )}
                {subjectConfigMessage && (
                    <p className="mt-2 text-xs font-bold text-white/70">{subjectConfigMessage}</p>
                )}
            </div>

            {/* SUBJECTS MANAGER */}
            <div className="somu border-none bg-white/5! rounded-2xl sm:rounded-3xl p-4 sm:p-5 mb-4 sm:mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-base sm:text-lg font-bold">Subjects</h3>
                        <p className="text-xs text-white/50">
                            Add, rename, or remove subjects. Only removes from this list — your choice.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full md:w-auto">
                        <input
                            value={newSubject}
                            onChange={(e) => setNewSubject(e.target.value.toUpperCase())}
                            placeholder="e.g. MATHEMATICS, SCIENCE"
                            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-[#B4F42A]/50 uppercase"
                        />
                        <button
                            type="button"
                            onClick={addSubject}
                            disabled={subjectSaving}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-[#B4F42A] text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
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
                        <span className="text-xs text-white/50">
                            {subjectError ? "Subjects could not be loaded." : "No subjects found."}
                        </span>
                    ) : (
                        subjects.map((t) => (
                            <div
                                key={t}
                                className="flex max-w-full items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white/80"
                            >
                                {editingSubject === t ? (
                                    <>
                                        <input
                                            autoFocus
                                            value={editingSubjectValue}
                                            onChange={(e) =>
                                                setEditingSubjectValue(e.target.value.toUpperCase())
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    void renameSubject(t);
                                                }
                                                if (e.key === "Escape") {
                                                    setEditingSubject(null);
                                                    setEditingSubjectValue("");
                                                }
                                            }}
                                            className="w-full min-w-0 max-w-36 px-2 py-1 rounded-lg bg-black/40 border border-[#B4F42A]/40 text-white text-xs outline-none uppercase"
                                        />
                                        <button
                                            type="button"
                                            disabled={subjectSaving}
                                            onClick={() => renameSubject(t)}
                                            className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-[#B4F42A]/20 disabled:opacity-50"
                                            title="Save name"
                                        >
                                            <Check className="w-3 h-3 text-[#B4F42A]" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={subjectSaving}
                                            onClick={() => {
                                                setEditingSubject(null);
                                                setEditingSubjectValue("");
                                            }}
                                            className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-white/10 disabled:opacity-50"
                                            title="Cancel"
                                        >
                                            <X className="w-3 h-3 text-white/60" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className="break-words">{t}</span>
                                        <button
                                            type="button"
                                            disabled={subjectSaving}
                                            onClick={() => {
                                                setSubjectError("");
                                                setEditingSubject(t);
                                                setEditingSubjectValue(t);
                                            }}
                                            className="ml-1 inline-flex items-center justify-center rounded-full p-0.5 hover:bg-white/10 disabled:opacity-50"
                                            title="Edit subject"
                                        >
                                            <Pencil className="w-3 h-3 text-white/50" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={subjectSaving}
                                            onClick={() => deleteSubject(t)}
                                            className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-red-500/20 disabled:opacity-50"
                                            title="Delete subject"
                                        >
                                            <Trash2 className="w-3 h-3 text-red-400" />
                                        </button>
                                    </>
                                )}
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
                                    <div className="min-w-0">
                                        <p className="font-bold capitalize text-sm break-words">{exam.subject}</p>
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
                                    <div key={subName} className="somu rounded-3xl p-4 sm:p-6 md:p-8 border-none mb-6">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
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
                                                    className="bg-white/5 p-4 rounded-2xl flex justify-between items-center gap-3 border border-white/5"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div
                                                            className={`w-2 h-2 shrink-0 rounded-full ${unit.completedPercent === 100 ? "bg-[#B4F42A]" : "bg-blue-400"
                                                                }`}
                                                        />
                                                        <span className="min-w-0 break-words text-sm font-medium text-white/90">{unit.unitName}</span>
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
