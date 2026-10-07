"use client";

import { useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import useHomeworkPage from "./useHomeworkPage";
import HomeworkForm from "./HomeworkForm";
import HomeworkStats from "./HomeworkStats";
import HomeworkFilterBar from "./HomeworkFilterBar";
import HomeworkList from "./HomeworkList";
import HomeworkSubmissionsView from "./HomeworkSubmissionsView";
import TimellyLoader from "../../common/TimellyLoader";

export default function TeacherHomeworkTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const homeworkId = searchParams.get("id");

  const handleBackFromSubmissions = () => {
    router.push("/frontend/pages/teacher?tab=homework");
  };

  const handleViewSubmissions = (id: string) => {
    router.push(`/frontend/pages/teacher?tab=homework&view=submissions&id=${id}`);
  };
  

  const {
    session,
    status,
    homeworks,
    classes,
    loading,
    showForm,
    setShowForm,
    expandedId,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    editingHomework,
    totalSubmissions,
    filteredHomeworks,
    handleDelete,
    handleEditClick,
    handleFormClose,
    handleSubmitSuccess,
    toggleExpanded,
  } = useHomeworkPage();

  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showForm || !editingHomework) return;
    const t = setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [showForm, editingHomework]);

  const handleSubmit = async (payload: {
    title: string;
    description: string;
    classId: string;
    subject: string;
    dueDate: string;
    assignedDate: string;
    file?: string | null;
  }) => {
    const url = editingHomework
      ? `/api/homework/${editingHomework.id}`
      : "/api/homework/create";
    const method = editingHomework ? "PUT" : "POST";
    const body: Record<string, unknown> = { ...payload };
    if (payload.file === undefined) delete body.file;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.message || "Failed to save");
    }
    const data = await res.json();
    const homework = data.homework ?? data;
    if (!homework || !homework.id) {
      throw new Error("Invalid response from server");
    }
    handleSubmitSuccess(homework);
  };

  const activeCount = useMemo(() => {
    const now = new Date().toISOString();
    return filteredHomeworks.filter((h) => h.dueDate && h.dueDate >= now).length;
  }, [filteredHomeworks]);

  const avgCompletionPercent = useMemo(() => {
    if (filteredHomeworks.length === 0) return 0;
    let totalPct = 0;
    let count = 0;
    filteredHomeworks.forEach((h) => {
      const total = h.class?._count?.students ?? 0;
      if (total > 0) {
        totalPct += ((h._count?.submissions ?? 0) / total) * 100;
        count += 1;
      }
    });
    return count > 0 ? Math.round(totalPct / count) : 0;
  }, [filteredHomeworks]);

  if (view === "submissions" && homeworkId) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden p-4 md:p-6 lg:p-10 text-white">
        <div className="max-w-7xl mx-auto">
          <HomeworkSubmissionsView homeworkId={homeworkId} onBack={handleBackFromSubmissions} />
        </div>
      </div>
    );
  }

  if ((status === "loading" || loading) && homeworks.length === 0) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden p-4 md:p-6 lg:p-10 text-white">
        <div className="max-w-7xl mx-auto">
          <TimellyLoader title="Loading homework" steps={["Assignments", "Classes", "Submissions"]} />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden p-4 md:p-6 lg:p-10 text-white">
        <div className="max-w-7xl mx-auto">
          <p className="text-white/80">Unauthorized</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden p-4 md:p-6 lg:p-10 text-white">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="rounded-2xl p-4 md:p-6 flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-xl md:text-2xl font-semibold">Homework Management</h2>
            <p className="text-white/60 text-sm">Assign and track student homework</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="w-full sm:w-auto px-6 py-3 rounded-full bg-lime-400 text-black font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            {showForm ? <X size={20} /> : <Plus size={20} />}
            <span className="text-sm md:text-base">
              {showForm ? "Cancel" : "Create New Assignment"}
            </span>
          </button>
        </div>

        {/* CREATE / EDIT FORM */}
        {showForm && (
          <div ref={formSectionRef}>
          <HomeworkForm
            classes={classes}
            editing={editingHomework}
            onCancel={handleFormClose}
            onSubmit={handleSubmit}
          />
          </div>
        )}

        {/* STATS */}
        <HomeworkStats
          activeCount={homeworks.length}
          totalSubmissions={totalSubmissions}
          avgCompletionPercent={avgCompletionPercent}
        />

        {/* FILTER & SEARCH */}
        <HomeworkFilterBar
          filter={filter}
          setFilter={setFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* LIST */}
        <HomeworkList
          homeworks={filteredHomeworks}
          expandedId={expandedId}
          onToggle={toggleExpanded}
          onEdit={handleEditClick}
          onDelete={handleDelete}
          onViewSubmissions={handleViewSubmissions}
        />
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
