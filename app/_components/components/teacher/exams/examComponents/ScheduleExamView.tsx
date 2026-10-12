"use client";
import { X, Save } from "lucide-react";
import PageHeader from "../../../common/PageHeader";
import TimellyLoader from "../../../common/TimellyLoader";
import { useScheduleExamState } from "./shared";
import { ExamDetailsFormFields } from "./shared";
import { SyllabusUnitsPanel } from "./shared";

export default function ScheduleExamView({
    mode = "create",
    examId,
    onCancel,
    onSave,
}: {
    mode?: "create" | "edit";
    examId?: string;
    onCancel: () => void;
    onSave?: () => void;
}) {
    const {
        units,
        setUnits,
        classes,
        examTypeOptions,
        subjectOptions,
        classLoading,
        selectedClassId,
        setSelectedClassId,
        examDate,
        setExamDate,
        startTime,
        setStartTime,
        durationMin,
        setDurationMin,
        examStatus,
        setExamStatus,
        examTitle,
        setExamTitle,
        subject,
        setSubject,
        submitLoading,
        submitError,
        examLoading,
        addUnit,
        removeUnit,
        isEdit,
        handleSubmit,
    } = useScheduleExamState({ mode, examId, onSave });

    if (isEdit && examLoading) {
        return (
            <TimellyLoader title="Loading exam" steps={["Classes", "Subjects", "Schedule"]} />
        );
    }

    return (
        <div className="min-h-screen text-white pb-10">
            <PageHeader
                title={isEdit ? "Edit Exam" : "Schedule Exam"}
                subtitle="Manage schedules and track syllabus coverage"
            />

            <form className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6" onSubmit={handleSubmit}>

                {/* LEFT COLUMN: Exam Details Card */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <ExamDetailsFormFields
                        examTitle={examTitle}
                        onExamTitleChange={setExamTitle}
                        examTypeOptions={examTypeOptions}
                        classLoading={classLoading}
                        classes={classes}
                        selectedClassId={selectedClassId}
                        onSelectedClassIdChange={setSelectedClassId}
                        subject={subject}
                        onSubjectChange={setSubject}
                        subjectOptions={subjectOptions}
                        examDate={examDate}
                        onExamDateChange={setExamDate}
                        examStatus={examStatus}
                        onExamStatusChange={setExamStatus}
                        startTime={startTime}
                        onStartTimeChange={setStartTime}
                        durationMin={durationMin}
                        onDurationMinChange={setDurationMin}
                    />

                    {submitError && (
                        <p className="text-red-400 text-sm py-2">{submitError}</p>
                    )}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={submitLoading}
                            className="flex-1 px-4 py-3 border border-white/10 rounded-xl text-gray-300
                             font-bold hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                        >
                            <X /> Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitLoading}
                            className="flex-1 px-4 py-3 bg-lime-400 hover:bg-lime-500 text-black rounded-xl
                            font-bold transition-all shadow-[0_0_15px_rgba(163,230,53,0.3)]
                             hover:shadow-[0_0_20px_rgba(163,230,53,0.4)] flex items-center justify-center gap-2"
                        >
                            {submitLoading ? "Saving…" : <><Save size={20} /> Save Exam</>}
                        </button>
                    </div>
                </div>

                <SyllabusUnitsPanel
                    units={units}
                    onUnitsChange={setUnits}
                    onAddUnit={addUnit}
                    onRemoveUnit={removeUnit}
                />
            </form>
        </div>
    );
}
