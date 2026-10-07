"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { HomeworkItem, ClassOption, HomeworkFilter } from "./types";
import {
  invalidateTeacherHomework,
  loadTeacherHomework,
  peekTeacherHomework,
  setTeacherHomeworkCache,
} from "@/lib/loadTeacherFastTabs";

export default function useHomeworkPage() {
  const { data: session, status } = useSession();
  const initial = peekTeacherHomework();
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>(() => initial?.homeworks ?? []);
  const [classes, setClasses] = useState<ClassOption[]>(() => initial?.classes ?? []);
  const [loading, setLoading] = useState(() => !initial);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HomeworkFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingHomework, setEditingHomework] = useState<HomeworkItem | null>(null);

  const applyPayload = useCallback((payload: { homeworks: HomeworkItem[]; classes: ClassOption[] }) => {
    setHomeworks(payload.homeworks);
    setClasses(payload.classes);
  }, []);

  const fetchData = useCallback(
    async (revalidate = false) => {
      if (!session) return;

      if (!revalidate) {
        const cached = peekTeacherHomework();
        if (cached) {
          applyPayload(cached);
          setLoading(false);
          void fetchData(true);
          return;
        }
      }

      setLoading((prev) => (homeworks.length === 0 ? true : prev));
      try {
        const payload = await loadTeacherHomework({ revalidate: true });
        applyPayload(payload);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [session, applyPayload, homeworks.length]
  );

  useEffect(() => {
    if (session) void fetchData(false);
  }, [session, fetchData]);

  const filteredHomeworks = useMemo(() => {
    let list = [...homeworks];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          h.subject.toLowerCase().includes(q) ||
          (h.class?.name && h.class.name.toLowerCase().includes(q))
      );
    }
    const now = new Date().toISOString();
    if (filter === "active") {
      list = list.filter((h) => h.dueDate && h.dueDate >= now);
    } else if (filter === "closed") {
      list = list.filter((h) => !h.dueDate || h.dueDate < now);
    }
    return list;
  }, [homeworks, searchQuery, filter]);

  const totalSubmissions = useMemo(
    () => homeworks.reduce((a, b) => a + (b._count?.submissions ?? 0), 0),
    [homeworks]
  );

  const syncCache = useCallback(
    (nextHomeworks: HomeworkItem[], nextClasses = classes) => {
      setTeacherHomeworkCache({ homeworks: nextHomeworks, classes: nextClasses });
    },
    [classes]
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Do you really want to delete this assignment? This action cannot be undone.")) return;
    const prev = homeworks;
    const next = prev.filter((h) => h.id !== id);
    setHomeworks(next);
    syncCache(next);
    if (expandedId === id) setExpandedId(null);
    try {
      const res = await fetch(`/api/homework/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHomeworks(prev);
        syncCache(prev);
        alert((d as { message?: string }).message || "Delete failed");
        return;
      }
      invalidateTeacherHomework();
      void fetchData(true);
    } catch (e) {
      console.error(e);
      setHomeworks(prev);
      syncCache(prev);
      alert("Delete failed. Check your connection.");
    }
  };

  const handleEditClick = (h: HomeworkItem) => {
    setEditingHomework(h);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingHomework(null);
  };

  const handleSubmitSuccess = async (createdOrUpdated: HomeworkItem) => {
    const next = editingHomework
      ? homeworks.map((h) => (h.id === createdOrUpdated.id ? createdOrUpdated : h))
      : [createdOrUpdated, ...homeworks];
    setHomeworks(next);
    syncCache(next);
    setShowForm(false);
    setEditingHomework(null);
    void fetchData(true);
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return {
    session,
    status,
    homeworks,
    filteredHomeworks,
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
    fetchData,
    handleDelete,
    handleEditClick,
    handleFormClose,
    handleSubmitSuccess,
    toggleExpanded,
  };
}
