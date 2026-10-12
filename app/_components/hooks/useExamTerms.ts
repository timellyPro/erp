"use client";

import { useState, useEffect, useCallback } from "react";

export interface ExamTermListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  classId: string;
  class: { id: string; name: string; section: string | null };
  _count: { schedules: number; syllabus: number };
  createdAt: string;
}

export interface SyllabusUnitItem {
  id: string;
  unitName: string;
  completedPercent: number;
  order: number;
}

export interface SyllabusItem {
  id: string;
  subject: string;
  completedPercent: number;
  notes: string | null;
  units: SyllabusUnitItem[];
}

export interface ExamScheduleItem {
  id: string;
  subject: string;
  examDate: string;
  startTime: string;
  durationMin: number;
}

export interface ExamTermDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  classId: string;
  class: { id: string; name: string; section: string | null };
  schedules: ExamScheduleItem[];
  syllabus: SyllabusItem[];
  createdAt: string;
}

interface UseExamTermsResult {
  terms: ExamTermListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useExamTerms(classId?: string | null, status?: string | null): UseExamTermsResult {
  const [terms, setTerms] = useState<ExamTermListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (classId) params.set("classId", classId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/exams/terms?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch exam terms");
      setTerms(data.terms ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch exam terms");
      setTerms([]);
    } finally {
      setLoading(false);
    }
  }, [classId, status]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { terms, loading, error, refetch };
}

export async function fetchExamTermDetail(id: string): Promise<ExamTermDetail | null> {
  try {
    const res = await fetch(`/api/exams/terms/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to fetch term");
    return data.term ?? null;
  } catch {
    return null;
  }
}
