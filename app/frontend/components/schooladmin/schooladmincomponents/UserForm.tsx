"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, Loader, User, Mail, Briefcase, Lock, Shield, User2, Phone, MapPin, Calendar, BookOpen } from "lucide-react";
import InputField from "./InputField";
import AllowedFeatureToggle from "./AllowedFeatureToggle";
import RoleSelector from "./RoleSelector";
import { Permission } from "@/app/frontend/enums/permissions";
import Spinner from "../../common/Spinner";
import { validateUserForm, type UserFormErrors } from "./userFormValidation";
import type { IUser } from "@/app/frontend/constants/addUserTable";
import {
  fetchUserForEdit,
  fetchUserFormMeta,
  invalidateAddUserPageCache,
  peekUserFormMeta,
} from "@/lib/fetchAddUserPage";

interface UserFormData {
  name: string;
  email: string;
  role: "SCHOOLADMIN" | "TEACHER" | "STUDENT";
  designation?: string;
  password?: string;
  confirmPassword?: string;
  allowedFeatures: string[];
  // Teacher-specific
  teacherId?: string;
  subjects?: string[];
  assignedClassIds?: string[];
  qualification?: string;
  experience?: string;
  joiningDate?: string;
  teacherStatus?: string;
  mobile?: string;
  address?: string;
}

interface UserFormProps {
  mode?: "create" | "edit";
  schoolId?: string | null;
  /** Row from list — instant shell while full user loads */
  listShellUser?: IUser | null;
  initialData?: UserFormData & { id?: string };
  onSuccess?: () => void;
}

function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const ddmmyyyy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${String(parseInt(m, 10)).padStart(2, "0")}-${String(parseInt(d, 10)).padStart(2, "0")}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const AVAILABLE_FEATURES_FOR_TEACHERS = [
  { key: Permission.DASHBOARD, label: "Dashboard" },
  { key: Permission.ADMISSION, label: "Admission" },
  { key: Permission.CLASSES, label: "Classes" },
  { key: Permission.HOMEWORK, label: "Homework" },
  { key: Permission.MARKS, label: "Marks" },
  { key: Permission.ATTENDANCE, label: "Attendance" },
  { key: Permission.EXAMS, label: "Exams & Syllabus" },
  { key: Permission.WORKSHOPS, label: "Workshops & Events" },
  { key: Permission.NEWSFEED, label: "Newsfeed" },
  { key: Permission.CHAT, label: "Parent Chat" },
  { key: Permission.LEAVES, label: "Leave" },
  { key: Permission.PROFILE, label: "Profile" },
  { key: Permission.SETTINGS, label: "Settings" },
  { key: Permission.STUDENTS, label: "Students" },
  { key: Permission.FEES, label: "Fees" },
  { key: Permission.CERTIFICATES, label: "Certificates" },
  { key: Permission.STUDENT_DETAILS, label: "Student Details" },
  { key: Permission.TEACHERS, label: "Teachers" },
  { key: Permission.TEACHER_LEAVES, label: "Teacher Leaves" },
  { key: Permission.TEACHER_AUDIT, label: "Teacher Audit" },
];

function formDataFromApi(userData: Record<string, unknown>): UserFormData {
  const joinDate = toDateInputValue(userData.joiningDate);
  const subjects = userData.subjects;
  return {
    name: String(userData.name || ""),
    email: String(userData.email || ""),
    role: (userData.role as UserFormData["role"]) || "TEACHER",
    designation: String(userData.designation || userData.subject || ""),
    password: "",
    confirmPassword: "",
    allowedFeatures: Array.isArray(userData.allowedFeatures)
      ? (userData.allowedFeatures as string[])
      : [],
    teacherId: String(userData.teacherId || ""),
    subjects: Array.isArray(subjects) && subjects.length ? (subjects as string[]) : [],
    assignedClassIds: Array.isArray(userData.assignedClassIds)
      ? (userData.assignedClassIds as string[])
      : [],
    qualification: String(userData.qualification || ""),
    experience: String(userData.experience || ""),
    joiningDate: joinDate,
    teacherStatus: String(userData.teacherStatus || "Active"),
    mobile: String(userData.mobile || ""),
    address: String(userData.address || ""),
  };
}

function shellFromListUser(user: IUser): UserFormData {
  return {
    name: user.name || "",
    email: user.email || "",
    role: (user.role as UserFormData["role"]) || "TEACHER",
    designation: user.designation || "",
    password: "",
    confirmPassword: "",
    allowedFeatures: user.allowedFeatures || [],
    teacherId: "",
    subjects: [],
    assignedClassIds: [],
    qualification: "",
    experience: "",
    joiningDate: "",
    teacherStatus: "Active",
    mobile: "",
    address: "",
  };
}

export default function UserForm({
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
      (listShellUser ? shellFromListUser(listShellUser) : {
        name: "",
        email: "",
        role: "TEACHER",
        designation: "",
        password: "",
        confirmPassword: "",
        allowedFeatures: [],
        teacherId: "",
        subjects: [],
        assignedClassIds: [],
        qualification: "",
        experience: "",
        joiningDate: "",
        teacherStatus: "Active",
        mobile: "",
        address: "",
      })
  );

  const [classesList, setClassesList] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [subjectInput, setSubjectInput] = useState("");

  // Keep local form state in sync when parent passes initialData (edit from list)
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setLoading(false);
    }
  }, [initialData]);

  useEffect(() => {
    if (listShellUser && !initialData) {
      setFormData(shellFromListUser(listShellUser));
      setLoading(false);
    }
  }, [listShellUser, initialData]);

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

  // Full user for edit — cache-first; list shell shows immediately
  useEffect(() => {
    if (!userId || initialData || !schoolId) return;

    setDetailLoading(true);
    const controller = new AbortController();

    void fetchUserForEdit(schoolId, userId, { signal: controller.signal })
      .then((userData) => {
        setFormData(formDataFromApi(userData));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load user data");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [userId, initialData, schoolId]);

  const handleChange = (field: keyof UserFormData, value: unknown) => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        {/* <Loader className="animate-spin text-lime-400" size={40} /> */}
        <Spinner />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {detailLoading ? (
        <p className="text-xs text-cyan-200/70">Loading full teacher profile…</p>
      ) : null}
      {/* Top Section: Form Fields + Access Control */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form Inputs (2/3 width) */}
        <div className="col-span-1 lg:col-span-2 space-y-6 bg-white/5 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-white/10">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-lime-400/20 flex items-center justify-center">
                <User className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">User Information</h2>
                <p className="text-xs text-white/50">
                  Add new users and configure their access to Timelly.
                </p>
              </div>
            </div>
          </div>

          {/* User Role Pills */}
          <div>
            <RoleSelector
              value={formData.role}
              onChange={(role) => {
                handleChange("role", role);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  (
                    [
                      "subjects",
                      "teacherId",
                      "qualification",
                      "experience",
                      "joiningDate",
                      "mobile",
                      "address",
                    ] as const
                  ).forEach((k) => {
                    delete next[k];
                  });
                  return next;
                });
              }}
            />
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              label="Full Name"
              value={formData.name}
              onChange={(v) => handleChange("name", v)}
              placeholder="Enter full name"
              icon={<User className="w-4 h-4" />}
              required
              error={fieldErrors.name}
            />

            <InputField
              label="Designation"
              value={formData.designation || ""}
              onChange={(v) => handleChange("designation", v)}
              placeholder="e.g. Senior Teacher"
              icon={<Briefcase className="w-4 h-4" />}
              error={fieldErrors.designation}
            />

            <div className="md:col-span-2">
              <p className="text-[11px] text-white/50">
                Email is auto-generated from full name using your school email domain
                {emailSettingsLoading ? "" : schoolEmailDomain ? ` (${schoolEmailDomain})` : ""}.
              </p>
            </div>
            <InputField
              label={`Password ${mode === "create" ? "" : "(Leave blank to keep unchanged)"}`}
              value={formData.password || ""}
              onChange={(v) => handleChange("password", v)}
              placeholder="Min 8 chars, letter + number"
              icon={<Lock className="w-4 h-4" />}
              type="password"
              required={mode === "create"}
              autoComplete="new-password"
              error={fieldErrors.password}
            />

            {formData.password && (
              <InputField
                label="Confirm Password"
                value={formData.confirmPassword || ""}
                onChange={(v) => handleChange("confirmPassword", v)}
                placeholder="Confirm password"
                icon={<Lock className="w-4 h-4" />}
                type="password"
                required
                autoComplete="new-password"
                error={fieldErrors.confirmPassword}
              />
            )}
          </div>

          {/* Teacher-specific fields */}
          {formData.role === "TEACHER" && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-lime-400/20 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-lime-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Teacher Details</h3>
                  <p className="text-xs text-white/50">Fill in teacher-specific information.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                  label="Teacher ID"
                  value={formData.teacherId || ""}
                  onChange={(v) => handleChange("teacherId", v.slice(0, 40))}
                  placeholder="e.g. TCH005"
                  icon={<User2 className="w-4 h-4" />}
                  error={fieldErrors.teacherId}
                />
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Subject(s) <span className="text-red-400">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(formData.subjects || []).map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-lime-400/20 border border-lime-400/30 text-lime-300 text-sm"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => handleChange("subjects", (formData.subjects || []).filter((x) => x !== s))}
                          className="hover:text-white"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subjectInput}
                      onChange={(e) => setSubjectInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = subjectInput.trim();
                          if (v && !(formData.subjects || []).includes(v)) {
                            handleChange("subjects", [...(formData.subjects || []), v]);
                            setSubjectInput("");
                          }
                        }
                      }}
                      placeholder="e.g. Mathematics (press Enter to add)"
                      className="flex-1 pl-4 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-lime-400/50 text-gray-400 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = subjectInput.trim();
                        if (v && !(formData.subjects || []).includes(v)) {
                          handleChange("subjects", [...(formData.subjects || []), v]);
                          setSubjectInput("");
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-lime-400/20 border border-lime-400/30 text-lime-300 text-sm font-medium hover:bg-lime-400/30"
                    >
                      Add
                    </button>
                  </div>
                  {fieldErrors.subjects ? (
                    <p className="text-xs text-red-400 mt-1.5" role="alert">
                      {fieldErrors.subjects}
                    </p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Assigned Classes</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-black/20 border border-white/10 rounded-xl min-h-[48px]">
                    {classesList.map((c) => {
                      const id = c.id;
                      const label = c.section ? `${c.name}-${c.section}` : c.name;
                      const selected = (formData.assignedClassIds || []).includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            const current = formData.assignedClassIds || [];
                            handleChange(
                              "assignedClassIds",
                              selected ? current.filter((x) => x !== id) : [...current, id]
                            );
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            selected
                              ? "bg-lime-400/30 border-lime-400/50 text-lime-200"
                              : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                    {classesList.length === 0 && (
                      <span className="text-white/40 text-sm">No classes found. Create classes first.</span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 mt-1">e.g. 10-A, 10-B — click to toggle</p>
                </div>
                <InputField
                  label="Qualification"
                  value={formData.qualification || ""}
                  onChange={(v) => handleChange("qualification", v.slice(0, 120))}
                  placeholder="e.g. M.Sc, B.Ed"
                  icon={<BookOpen className="w-4 h-4" />}
                  error={fieldErrors.qualification}
                />
                <InputField
                  label="Experience"
                  value={formData.experience || ""}
                  onChange={(v) => handleChange("experience", v.slice(0, 80))}
                  placeholder="e.g. 5 Years"
                  icon={<Briefcase className="w-4 h-4" />}
                  error={fieldErrors.experience}
                />
                <InputField
                  label="Joining Date"
                  value={formData.joiningDate || ""}
                  onChange={(v) => handleChange("joiningDate", v)}
                  type="date"
                  icon={<Calendar className="w-4 h-4" />}
                  error={fieldErrors.joiningDate}
                />
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Status</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40">
                      <CheckCircle className="w-4 h-4" />
                    </span>
                    <select
                      value={formData.teacherStatus || "Active"}
                      onChange={(e) => handleChange("teacherStatus", e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-lime-400/50 text-gray-400"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <InputField
                  label="Phone Number"
                  value={formData.mobile || ""}
                  onChange={(v) => handleChange("mobile", v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  icon={<Phone className="w-4 h-4" />}
                  inputMode="numeric"
                  autoComplete="tel"
                  error={fieldErrors.mobile}
                />
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Address</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-3 text-white/40">
                      <MapPin className="w-4 h-4" />
                    </span>
                    <textarea
                      value={formData.address || ""}
                      onChange={(e) => handleChange("address", e.target.value.slice(0, 500))}
                      placeholder="Full Address"
                      rows={2}
                      aria-invalid={Boolean(fieldErrors.address)}
                      className={`w-full pl-11 pr-4 py-3 bg-black/20 rounded-xl focus:outline-none focus:ring-1 text-gray-400 resize-none ${
                        fieldErrors.address
                          ? "border border-red-500/60 focus:ring-red-400/40"
                          : "border border-white/10 focus:ring-lime-400/50"
                      }`}
                    />
                  </div>
                  {fieldErrors.address ? (
                    <p className="text-xs text-red-400 mt-1.5" role="alert">
                      {fieldErrors.address}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Access Control Toggles (1/3 width) */}
        <div className="col-span-1 bg-black/20 bg-gradient-to-b from-white/10/5
         to-white/0 rounded-2xl p-5 flex flex-col gap-4 
          bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 h-full">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <Shield className="lucide lucide-shield w-5 h-5 text-lime-400" /> Access Control{" "}
                <span className="text-red-400 text-sm font-normal">*</span>
              </h3>
              <p className="text-[11px] text-white/50">
                Choose which modules this user can access.
              </p>
              {fieldErrors.allowedFeatures ? (
                <p className="text-xs text-red-400 mt-2" role="alert">
                  {fieldErrors.allowedFeatures}
                </p>
              ) : null}
            </div>
            <span className="text-[11px] font-medium text-lime-300 px-3 py-1 bg-lime-400/10 text-lime-400
             text-xs font-bold rounded-full border border-lime-400/20">
              {formData.allowedFeatures.length} Active
            </span>
          </div>

          {/* Select All */}
          <AllowedFeatureToggle
            label="Select All"
            checked={formData.allowedFeatures.length === AVAILABLE_FEATURES_FOR_TEACHERS.length}
            onChange={() => {
              const allSelected = formData.allowedFeatures.length === AVAILABLE_FEATURES_FOR_TEACHERS.length;
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
            }}
          />

          <div className="lg:col-span-1" />

          <div className="space-y-4 overflow-y-auto pr-2 no-scrollbar">
            {AVAILABLE_FEATURES_FOR_TEACHERS.map((feature) => (
              <AllowedFeatureToggle
                key={feature.key}
                label={feature.label}
                checked={formData.allowedFeatures.includes(feature.key)}
                onChange={() => handleFeatureToggle(feature.key)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30"
        >
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </motion.div>
      )}

      {/* Success Message */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-lime-400/20 border border-lime-400/30"
        >
          <CheckCircle size={18} className="text-lime-400 flex-shrink-0" />
          <span className="text-sm text-lime-300">
            User {userId ? "updated" : "created"} successfully!
          </span>
        </motion.div>
      )}

      {/* Submit Buttons */}
      <div className="flex justify-end pt-4 gap-3">
        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={{ x: 4 }}
          className="px-6 py-3 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl 
          shadow-lg shadow-lime-400/20 transition-all flex items-center gap-2"
        >
          {submitting ? (
            <>
              <Spinner color="black" />
              Saving...
            </>
          ) : (
            <><User className="lucide lucide-user-plus w-5 h-5" /> {userId ? "Update" : "Create"} User
            </>
          )}
        </motion.button>
        <motion.button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", "add-user");
            params.set("view", "all");
            params.delete("userId");
            router.push(`?${params.toString()}`);
          }}
          disabled={submitting}
          whileHover={{ x: -4 }}
          className="px-6 py-3 border border-white/10 text-gray-400
           font-medium rounded-xl hover:bg-white/5 transition-all"
        >
          Cancel
        </motion.button>
      </div>
    </form>
  );
}
