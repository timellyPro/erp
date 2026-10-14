"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { validateUserForm, type UserFormErrors } from "../userFormValidation";
import {
  fetchUserFormMeta,
  invalidateAddUserPageCache,
  peekUserFormMeta,
} from "@/lib/school/fetchAddUserPage";
import type { UserFormData, UserFormProps } from "./userFormTypes";
import { AVAILABLE_FEATURES_FOR_TEACHERS, EMPTY_FORM, formDataFromApi, listShellFields } from "./userFormHelpers";

export function useUserFormState({
  mode = "create",
  schoolId = null,
  listShellUser = null,
  initialData,
  onSuccess,
}: UserFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");

  const [loading, setLoading] = useState(
    !!userId && !initialData && !listShellUser
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UserFormErrors>({});
  const [success, setSuccess] = useState(false);
  const [schoolEmailDomain, setSchoolEmailDomain] = useState<string | null>(null);
  const [emailSettingsLoading, setEmailSettingsLoading] = useState(false);

  const [formData, setFormData] = useState<UserFormData>(
    initialData ||
      (listShellUser
        ? { ...EMPTY_FORM, ...listShellFields(listShellUser) }
        : EMPTY_FORM)
  );

  const [classesList, setClassesList] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [subjectInput, setSubjectInput] = useState("");
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [subjectsDropdownOpen, setSubjectsDropdownOpen] = useState(false);

  // Keep local form state in sync when parent passes initialData (edit from list)
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setLoading(false);
    }
  }, [initialData]);

  const shellAppliedForUserRef = React.useRef<string | null>(null);
  const formDirtyRef = React.useRef(false);
  /** Fields the user edited — only these override API data when detail load finishes. */
  const touchedFieldsRef = React.useRef<Set<keyof UserFormData>>(new Set());

  useEffect(() => {
    if (!listShellUser || initialData || !userId) return;
    if (shellAppliedForUserRef.current === userId) return;
    shellAppliedForUserRef.current = userId;

    setFormData((prev) => ({
      ...prev,
      ...listShellFields(listShellUser),
    }));
    setLoading(false);
  }, [listShellUser, initialData, userId]);

  // Fetch available subjects from exam-subjects API
  useEffect(() => {
    fetch("/api/exam-subjects", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.subjects)) setAvailableSubjects(data.subjects);
      })
      .catch(() => {});
  }, []);

  // Form metadata (classes + email domain) — cache-first
  useEffect(() => {
    if (!schoolId) return;
    const cached = peekUserFormMeta(schoolId);
    if (cached) {
      setClassesList(cached.classes);
      setSchoolEmailDomain(cached.emailDomain);
      setEmailSettingsLoading(false);
    }

    const controller = new AbortController();
    void fetchUserFormMeta(schoolId, {
      revalidate: !cached,
      signal: controller.signal,
    })
      .then((meta) => {
        setClassesList(meta.classes);
        setSchoolEmailDomain(meta.emailDomain);
      })
      .catch(() => {
        /* optional */
      })
      .finally(() => {
        if (!controller.signal.aborted) setEmailSettingsLoading(false);
      });

    return () => controller.abort();
  }, [schoolId]);

  // Reset edit state when switching users
  useEffect(() => {
    formDirtyRef.current = false;
    touchedFieldsRef.current = new Set();
    shellAppliedForUserRef.current = null;
  }, [userId]);

  // Full user for edit — fetch directly, bypassing all caches
  useEffect(() => {
    if (!userId || initialData) return;

    setDetailLoading(true);
    setLoading(false);
    const controller = new AbortController();

    fetch(`/api/user/${encodeURIComponent(userId)}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((userData: Record<string, unknown>) => {
        const fromApi = formDataFromApi(userData);
        setFormData((prev) => {
          if (!formDirtyRef.current || touchedFieldsRef.current.size === 0) {
            return fromApi;
          }
          // Keep only fields the user actually edited; never wipe API
          // subjects / classes with empty shell defaults from a dirty name/role edit.
          const merged: UserFormData = { ...fromApi };
          for (const field of touchedFieldsRef.current) {
            const value = prev[field];
            (merged as unknown as Record<string, unknown>)[field] = value;
          }
          return merged;
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load user data");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [userId, initialData]);

  const markFieldTouched = (field: keyof UserFormData) => {
    formDirtyRef.current = true;
    touchedFieldsRef.current.add(field);
  };

  const handleChange = (field: keyof UserFormData, value: unknown) => {
    markFieldTouched(field);
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setFieldErrors((prev) => {
      const key = field as keyof UserFormErrors;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleFeatureToggle = (feature: string) => {
    markFieldTouched("allowedFeatures");
    setFormData((prev) => ({
      ...prev,
      allowedFeatures: prev.allowedFeatures.includes(feature)
        ? prev.allowedFeatures.filter((f) => f !== feature)
        : [...prev.allowedFeatures, feature],
    }));
    setFieldErrors((prev) => {
      if (!prev.allowedFeatures) return prev;
      const next = { ...prev };
      delete next.allowedFeatures;
      return next;
    });
    setError(null);
  };

  const handleToggleAllFeatures = () => {
    const allSelected = formData.allowedFeatures.length === AVAILABLE_FEATURES_FOR_TEACHERS.length;
    markFieldTouched("allowedFeatures");
    setFormData((prev) => ({
      ...prev,
      allowedFeatures: allSelected
        ? []
        : AVAILABLE_FEATURES_FOR_TEACHERS.map((f) => f.key),
    }));
    setFieldErrors((prev) => {
      if (!prev.allowedFeatures) return prev;
      const next = { ...prev };
      delete next.allowedFeatures;
      return next;
    });
    setError(null);
  };

  const validateForm = (): boolean => {
    const errs = validateUserForm(formData, mode);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Please fix the highlighted fields below.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (detailLoading) {
      setError("Still loading teacher profile — wait a moment, then save.");
      return;
    }

    if (!validateForm()) return;

    setSubmitting(true);
    setError(null);

    try {
      const endpoint = userId ? `/api/user/${userId}` : "/api/user/create";
      const method = userId ? "PUT" : "POST";

      const payload: Record<string, unknown> = {
        name: formData.name,
        role: formData.role,
        designation: formData.designation,
        allowedFeatures: formData.allowedFeatures,
        ...(formData.password && { password: formData.password }),
      };
      if (formData.role === "TEACHER") {
        payload.teacherId = formData.teacherId || undefined;
        payload.subjects = formData.subjects || [];
        payload.assignedClassIds = formData.assignedClassIds || [];
        payload.qualification = formData.qualification || undefined;
        payload.experience = formData.experience || undefined;
        payload.joiningDate = formData.joiningDate || undefined;
        payload.teacherStatus = formData.teacherStatus || "Active";
        payload.mobile = formData.mobile || undefined;
        payload.address = formData.address || undefined;
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Failed to ${userId ? "update" : "create"} user`);
      }

      if (schoolId) invalidateAddUserPageCache(schoolId);
      setSuccess(true);

      if (onSuccess) {
        window.setTimeout(() => onSuccess(), 500);
      } else {
        window.setTimeout(() => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("tab", "add-user");
          params.set("view", "all");
          params.delete("userId");
          router.push(`?${params.toString()}`);
        }, 500);
      }
    } catch (err) {
      setFieldErrors({});
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelToUserList = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "add-user");
    params.set("view", "all");
    params.delete("userId");
    router.push(`?${params.toString()}`);
  };

  return {
    userId,
    loading,
    detailLoading,
    submitting,
    error,
    setError,
    fieldErrors,
    setFieldErrors,
    success,
    schoolEmailDomain,
    emailSettingsLoading,
    formData,
    setFormData,
    classesList,
    subjectInput,
    setSubjectInput,
    availableSubjects,
    subjectsDropdownOpen,
    setSubjectsDropdownOpen,
    markFieldTouched,
    handleChange,
    handleFeatureToggle,
    handleToggleAllFeatures,
    handleSubmit,
    cancelToUserList,
  };
}
