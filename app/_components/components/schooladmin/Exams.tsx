"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Plus } from "lucide-react";

import { useExamTerms, fetchExamTermDetail } from "@/app/_components/hooks/useExamTerms";
import { useClasses } from "@/app/_components/hooks/useClasses";

import type { ExamTermDetail, ExamTermListItem } from "@/app/_components/hooks/useExamTerms";
import {
  EXAM_ACCENT,
  EXAM_TEXT_SECONDARY,
  EXAM_TEXT_MAIN,
} from "@/app/_components/constants/colors";
import ExamTermCard from "./exams/ExamTermCard";
import GlassCard from "./exams/GlassCard";
import ExamScheduleTab from "./exams/ExamScheduleTab";
import NewExamTermModal from "./exams/NewExamTermModal";
import SyllabusTrackingTab from "./exams/SyllabusTrackingTab";
import Spinner from "../common/Spinner";
import PageHeader from "../common/PageHeader";

type TabId = "schedule" | "syllabus";

export default function ExamsPage() {
  return <ExamsPageInner />;
}

export function ExamsPageInner() {
  const { terms, loading, error, refetch } = useExamTerms();
  const { classes } = useClasses();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [termDetail, setTermDetail] = useState<ExamTermDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("schedule");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<ExamTermListItem | null>(null);

  const upcoming = terms.filter((t) => t.status === "UPCOMING");
  const completed = terms.filter((t) => t.status === "COMPLETED");

  useEffect(() => {
    if (!terms.length) {
      setSelectedId(null);
      setTermDetail(null);
      return;
    }

    if (!selectedId || !terms.some((t) => t.id === selectedId)) {
      setSelectedId(upcoming[0]?.id ?? terms[0].id);
    }
  }, [terms, selectedId, upcoming]);

  useEffect(() => {
    if (!selectedId) {
      setTermDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    fetchExamTermDetail(selectedId)
      .then((detail) => {
        if (!cancelled) setTermDetail(detail);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleTermSaved = (savedId?: string) => {
    refetch();
    if (savedId) setSelectedId(savedId);
    if (selectedId) {
      setDetailLoading(true);
      fetchExamTermDetail(savedId ?? selectedId)
        .then(setTermDetail)
        .finally(() => setDetailLoading(false));
    }
  };

  const handleSyllabusChange = () => {
    if (selectedId) {
      setDetailLoading(true);
      fetchExamTermDetail(selectedId)
        .then(setTermDetail)
        .finally(() => setDetailLoading(false));
    }
  };

  const handleScheduleChange = () => {
    if (selectedId) {
      setDetailLoading(true);
      fetchExamTermDetail(selectedId)
        .then(setTermDetail)
        .finally(() => setDetailLoading(false));
    }
  };

  const startsInDays = useMemo(() => {
    if (termDetail?.status !== "UPCOMING" || !termDetail.schedules?.length) return null;

    const firstDate = [...termDetail.schedules]
      .map((s) => new Date(s.examDate))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    firstDate.setHours(0, 0, 0, 0);

    const diff = Math.ceil((firstDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [termDetail]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <PageHeader
          title="Exams & Syllabus"
          subtitle="Manage examination schedules and syllabus tracking"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 backdrop-blur-xl mb-0"
          rightSlot={
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl
               shadow-lg shadow-lime-400/20 transition-all flex items-center gap-2 text-sm"
              style={{
                backgroundColor: EXAM_ACCENT,
                boxShadow: `0 0 22px ${EXAM_ACCENT}44`,
              }}
            >
              <Plus size={18} />
              Add Exam Term
            </button>
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 lg:h-[calc(100vh-180px)] lg:overflow-hidden">
          <aside className="order-2 lg:order-1 lg:col-span-4 space-y-3 lg:h-full lg:overflow-y-auto lg:pr-2 no-scrollbar">
            {error && <p className="text-sm text-red-400">{error}</p>}

            {loading ? (
              <GlassCard className="p-10 flex justify-center">
                <Spinner />
              </GlassCard>
            ) : (
              <>
                {upcoming.map((t) => (
                  <ExamTermCard
                    key={t.id}
                    term={t}
                    isSelected={selectedId === t.id}
                    onClick={() => setSelectedId(t.id)}
                    onEdit={setEditingTerm}
                  />
                ))}

                {completed.map((t) => (
                  <ExamTermCard
                    key={t.id}
                    term={t}
                    isSelected={selectedId === t.id}
                    onClick={() => setSelectedId(t.id)}
                    onEdit={setEditingTerm}
                  />
                ))}

                {!terms.length && (
                  <GlassCard variant="default" className="p-8 text-center" style={{ color: EXAM_TEXT_SECONDARY }}>
                    No exam terms. Click "Add Exam Term" to create one.
                  </GlassCard>
                )}
              </>
            )}
          </aside>

          <section className="order-1 lg:order-2 lg:col-span-8 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden min-h-[600px] flex flex-col lg:h-full lg:min-h-0">
            {!selectedId ? (
              <GlassCard className="min-h-[420px] p-8 sm:p-12 flex items-center justify-center" style={{ color: EXAM_TEXT_SECONDARY }}>
                <Calendar className="mb-3 h-11 w-11 opacity-70" style={{ color: EXAM_TEXT_MAIN }} />
                <p>Select an exam term to view schedule and syllabus.</p>
              </GlassCard>
            ) : detailLoading ? (
              <GlassCard className="min-h-[420px] p-8 sm:p-12 flex items-center justify-center">
                <Spinner />
              </GlassCard>
            ) : termDetail ? (
              <GlassCard variant="card" className="h-full flex flex-col border-b border-white/10 bg-black/20">
                <div className="p-6 border-b border-white/10 bg-black/20">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-2xl font-bold text-white mb-2" style={{ color: EXAM_TEXT_MAIN }}>
                        {termDetail.name}
                      </h2>
                      {termDetail.description && (
                        <p className="text-gray-400 text-sm max-w-xl" style={{ color: EXAM_TEXT_SECONDARY }}>
                          {termDetail.description}
                        </p>
                      )}
                    </div>

                    {startsInDays !== null && (
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-xs text-gray-500 mb-1" style={{ color: EXAM_TEXT_SECONDARY }}>Starts in</p>
                        <div className="text-3xl font-bold text-lime-400" style={{ color: EXAM_ACCENT }}>
                          {startsInDays}
                        </div>
                        <p className="text-sm font-normal text-gray-400" style={{ color: EXAM_TEXT_SECONDARY }}>days</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex gap-2 sm:gap-6 border-b border-white/10 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setTab("schedule")}
                      className="min-h-[44px] border-b-2 px-1 pb-3 text-base font-semibold whitespace-nowrap pb-3 text-sm font-medium transition-all relative text-lime-400"
                      style={tab === "schedule" ? { color: EXAM_ACCENT, borderBottomColor: EXAM_ACCENT } : { color: EXAM_TEXT_SECONDARY, borderBottomColor: "transparent" }}
                    >
                      Exam Schedule
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("syllabus")}
                      className="min-h-[44px] border-b-2 px-1 pb-3 text-base font-semibold whitespace-nowrap pb-3 text-sm font-medium transition-all relative text-gray-400 hover:text-gray-200"
                      style={tab === "syllabus" ? { color: EXAM_ACCENT, borderBottomColor: EXAM_ACCENT } : { color: EXAM_TEXT_SECONDARY, borderBottomColor: "transparent" }}
                    >
                      Syllabus Tracking
                    </button>
                  </div>
                </div>

                <div className="p-6 flex-1 bg-black/10 overflow-y-auto no-scrollbar">
                  <AnimatePresence mode="wait">
                    {tab === "schedule" && (
                      <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <ExamScheduleTab
                          termId={termDetail.id}
                          schedules={termDetail.schedules ?? []}
                          onScheduleChange={handleScheduleChange}
                        />
                      </motion.div>
                    )}

                    {tab === "syllabus" && (
                      <motion.div key="syllabus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <SyllabusTrackingTab
                          termId={termDetail.id}
                          syllabus={termDetail.syllabus ?? []}
                          onSyllabusChange={handleSyllabusChange}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </GlassCard>
            ) : (
              <GlassCard className="min-h-[420px] p-8 sm:p-12 flex items-center justify-center" style={{ color: EXAM_TEXT_SECONDARY }}>
                Unable to load selected term details.
              </GlassCard>
            )}
          </section>
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <NewExamTermModal
            key="create-exam-term-modal"
            classes={classes}
            onClose={() => setShowAddModal(false)}
            onSaved={handleTermSaved}
          />
        )}
        {editingTerm && (
          <NewExamTermModal
            key={`edit-exam-term-${editingTerm.id}`}
            mode="edit"
            termId={editingTerm.id}
            classes={classes}
            initialValues={{
              name: editingTerm.name,
              description: editingTerm.description ?? "",
              classId: editingTerm.classId,
              status: editingTerm.status as "UPCOMING" | "COMPLETED",
            }}
            onClose={() => setEditingTerm(null)}
            onSaved={handleTermSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
