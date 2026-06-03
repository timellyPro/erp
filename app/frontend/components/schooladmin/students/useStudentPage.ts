"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStudents } from "../../../hooks/useStudents";
import { addStudent, assignStudentsToClass, updateStudent, deleteStudent as deleteStudentApi } from "../../../services/student.service";
import { toast } from "../../../services/toast.service";
import {
  ClassItem,
  SelectOption,
  StudentFormErrors,
  StudentFormState,
  StudentRow,
} from "./types";
import { mergeStudentAfterEdit, toStudentForm } from "./utils";
import { fetchAllStudents as fetchAllStudentsPaginated } from "@/lib/fetchAllStudents";

type Props = {
  classes?: ClassItem[];
  reload?: () => void;
};

type ClassesListResponse = {
  classes: ClassItem[];
};

type StudentsListResponse = {
  students: StudentRow[];
};

type UploadFailedRow = {
  row?: number;
  error?: string;
};

type UploadResult = {
  createdCount?: number;
  failedCount?: number;
  failed?: UploadFailedRow[];
};

const formatStudentMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("student name and timelly id already exist")) {
    return "Student with same name and Timelly ID already exists.";
  }
  if (normalized.includes("timelly id already exists")) {
    return "Timelly ID already exists.";
  }
  if (normalized.includes("aadhaar number already exists in another school")) {
    return "Aadhaar number already exists in another school.";
  }
  if (normalized.includes("upload failed at row")) {
    return message;
  }
  return message || "Something went wrong. Please try again.";
};

let classesCache: ClassItem[] | null = null;
let classesPromise: Promise<ClassItem[] | null> | null = null;

const preloadClasses = () => {
  if (classesCache) return Promise.resolve(classesCache);
  if (classesPromise) return classesPromise;

  classesPromise = fetch("/api/class/list", { cache: "no-store", credentials: "include" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data: ClassesListResponse = await res.json();
      classesCache = data.classes || [];
      return classesCache;
    })
    .catch(() => null)
    .finally(() => {
      classesPromise = null;
    });

  return classesPromise;
};

void preloadClasses();

const DEFAULT_FORM: StudentFormState = {
  name: "",
  rollNo: "",
  penNumber: "",
  apaarId: "",
  gender: "",
  residencyType: "Day Scholar",
  dob: "",
  classId: "",
  section: "",
  status: "Active",
  fatherName: "",
  motherName: "",
  occupation: "",
  officeAddress: "",
  phoneNo: "",
  email: "",
  address: "",
  aadhaarNo: "",
  parentAadharNo: "",
  parentWhatsapp: "",
  bankAccountNo: "",
  totalFee: "",
  discountPercent: "",
  applicationFee: "",
  admissionFee: "",
  previousSchool: "",
  houseNo: "",
  street: "",
  city: "",
  town: "",
  state: "",
  pinCode: "",
  nationality: "Indian",
  languagesAtHome: "",
  caste: "",
  religion: "",
  emergencyFatherNo: "",
  emergencyMotherNo: "",
  emergencyGuardianNo: "",
};

const EMPTY_CLASSES: ClassItem[] = [];

const digitsOnly = (value: string) => value.replace(/\D/g, "");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateForm = (
  form: StudentFormState,
  options: {
    requireAadhaar: boolean;
    requirePhone: boolean;
    requireClass?: boolean;
    requireGender?: boolean;
    strictOptionalFormats?: boolean;
  }
): StudentFormErrors => {
  const newErrors: StudentFormErrors = {};

  if (!form.name.trim() || form.name.length < 2) {
    newErrors.name = "Student name must be at least 2 characters";
  }

  if (!form.fatherName.trim() || form.fatherName.length < 2) {
    newErrors.fatherName = "Parent name must be at least 2 characters";
  }

  if (options.requireGender && !form.gender.trim()) {
    newErrors.gender = "Please select gender";
  }

  if (options.requireAadhaar) {
    const a12 = digitsOnly(form.aadhaarNo);
    if (a12.length !== 12) {
      newErrors.aadhaarNo = "Aadhaar number must be exactly 12 digits";
    }
  }

  if (options.requirePhone) {
    const p10 = digitsOnly(form.phoneNo);
    if (p10.length !== 10) {
      newErrors.phoneNo = "Contact number must be exactly 10 digits";
    }
  }

  if (!form.dob || Number.isNaN(new Date(form.dob).getTime())) {
    newErrors.dob = "Please enter a valid date of birth";
  } else if (new Date(form.dob) >= new Date()) {
    newErrors.dob = "Date of birth must be in the past";
  }

  if (options.requireClass && !form.classId.trim()) {
    newErrors.classId = "Please select a class";
  }

  if (form.address.trim() && form.address.trim().length < 5) {
    newErrors.address = "Address must be at least 5 characters when provided";
  }

  const roll = form.rollNo.trim();
  if (roll.length > 40) {
    newErrors.rollNo = "Student ID must be at most 40 characters";
  }

  if (options.strictOptionalFormats) {
    const email = form.email.trim();
    if (email && !EMAIL_REGEX.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    const pa = digitsOnly(form.parentAadharNo);
    if (form.parentAadharNo.trim() && pa.length !== 12) {
      newErrors.parentAadharNo = "Parent Aadhaar must be exactly 12 digits";
    }

    const pw = digitsOnly(form.parentWhatsapp);
    if (form.parentWhatsapp.trim() && pw.length !== 10) {
      newErrors.parentWhatsapp = "WhatsApp number must be exactly 10 digits";
    }

    const pin = digitsOnly(form.pinCode);
    if (form.pinCode.trim() && pin.length !== 6) {
      newErrors.pinCode = "PIN code must be exactly 6 digits";
    }

    const bank = form.bankAccountNo.replace(/\s/g, "");
    if (bank && !/^\d{9,18}$/.test(bank)) {
      newErrors.bankAccountNo = "Bank account number must be 9–18 digits";
    }

    const checkEmergency = (raw: string, key: keyof StudentFormState) => {
      if (!raw.trim()) return;
      const d = digitsOnly(raw);
      if (d.length !== 10) {
        newErrors[key] = "Must be exactly 10 digits";
      }
    };
    checkEmergency(form.emergencyFatherNo, "emergencyFatherNo");
    checkEmergency(form.emergencyMotherNo, "emergencyMotherNo");
    checkEmergency(form.emergencyGuardianNo, "emergencyGuardianNo");
  }

  return newErrors;
};

export default function useStudentPage({ classes, reload }: Props) {
  const stableClasses = classes ?? EMPTY_CLASSES;
  const router = useRouter();
  const bumpAfterMutation = useCallback(() => {
    reload?.();
    try {
      router.refresh();
    } catch {
      /* noop */
    }
  }, [reload, router]);

  const [availableClasses, setAvailableClasses] = useState<ClassItem[]>(
    stableClasses.length ? stableClasses : classesCache ?? []
  );
  const [classesLoading, setClassesLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<StudentFormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<StudentFormErrors>({});
  const [saving, setSaving] = useState(false);

  const selectedClassIdForFetch = useMemo(() => {
    if (!selectedClass || !selectedSection) return "";
    const match = availableClasses.find(
      (item) => item.name === selectedClass && item.section === selectedSection
    );
    return match?.id ?? "";
  }, [availableClasses, selectedClass, selectedSection]);

  const {
    students,
    loading,
    refresh,
    refreshSilent,
    patchStudent,
    removeStudent,
  } = useStudents(selectedClassIdForFetch);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  const [viewStudent, setViewStudent] = useState<StudentRow | null>(null);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);
  const [editForm, setEditForm] = useState<StudentFormState>(DEFAULT_FORM);
  const [editErrors, setEditErrors] = useState<StudentFormErrors>({});
  const [editSaving, setEditSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [exportingDetails, setExportingDetails] = useState(false);

  useEffect(() => {
    if (stableClasses.length) {
      setAvailableClasses(stableClasses);
    }
  }, [stableClasses]);

  useEffect(() => {
    if (stableClasses.length) return;

    if (classesCache?.length) {
      setAvailableClasses(classesCache);
      return;
    }

    let active = true;
    setClassesLoading(true);
    preloadClasses()
      .then((data) => {
        if (!active || !data) return;
        setAvailableClasses(data);
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [stableClasses]);

  useEffect(() => {
    if (!form.classId && selectedClassIdForFetch) {
      setForm((prev) => ({ ...prev, classId: selectedClassIdForFetch }));
    }
  }, [selectedClassIdForFetch, form.classId]);

  useEffect(() => {
    if (!selectedSection) return;
    const sectionExists = availableClasses.some(
      (item) =>
        item.section === selectedSection &&
        (!selectedClass || item.name === selectedClass)
    );
    if (!sectionExists) {
      setSelectedSection("");
    }
  }, [availableClasses, selectedClass, selectedSection]);

  const fetchAllStudents = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setAllLoading(true);
    try {
      const rows = await fetchAllStudentsPaginated<StudentRow>(
        { cache: "no-store", credentials: "include" },
        { take: 100, maxPages: 50 }
      );
      setAllStudents(rows);
    } catch {
      // ignore
    } finally {
      if (!options?.silent) setAllLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedClassIdForFetch) {
      fetchAllStudents();
    }
  }, [selectedClassIdForFetch]);

  const filterClassOptions = useMemo<SelectOption[]>(() => {
    const uniqueNames = Array.from(
      new Set(availableClasses.map((item) => item.name).filter(Boolean))
    ) as string[];
    return [
      { label: "All Classes", value: "" },
      ...uniqueNames.map((name) => ({ label: name, value: name })),
    ];
  }, [availableClasses]);

  const filterSectionOptions = useMemo<SelectOption[]>(() => {
    const sections = Array.from(
      new Set(
        availableClasses
          .filter((item) => !selectedClass || item.name === selectedClass)
          .map((item) => item.section)
          .filter(Boolean)
      )
    ) as string[];
    return [
      { label: "All Sections", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [availableClasses, selectedClass]);

  const formClassOptions = useMemo<SelectOption[]>(() => {
    if (classesLoading) {
      return [{ label: "Loading classes...", value: "" }];
    }
    if (!availableClasses.length) {
      return [{ label: "No classes found", value: "" }];
    }
    return [
      { label: "Select Class", value: "" },
      ...availableClasses.map((item) => ({
        label: `${item.name}${item.section ? ` - ${item.section}` : ""}`,
        value: item.id,
      })),
    ];
  }, [availableClasses, classesLoading]);

  const formSectionOptions = useMemo<SelectOption[]>(() => {
    const sections = Array.from(
      new Set(availableClasses.map((item) => item.section).filter(Boolean))
    ) as string[];
    if (classesLoading) {
      return [{ label: "Loading sections...", value: "" }];
    }
    if (!sections.length) {
      return [{ label: "No sections found", value: "" }];
    }
    return [
      { label: "Select Section", value: "" },
      ...sections.map((section) => ({ label: section, value: section })),
    ];
  }, [availableClasses, classesLoading]);

  const filteredStudents = useMemo<StudentRow[]>(() => {
    let list: StudentRow[] = selectedClassIdForFetch ? students : allStudents;
    if (selectedClass) {
      list = list.filter((student) => student.class?.name === selectedClass);
    }
    if (selectedSection) {
      list = list.filter((student) => student.class?.section === selectedSection);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      list = list.filter((student) => {
        const name = student.user?.name || student.name || "";
        const email = student.user?.email || student.email || "";
        const roll = student.rollNo || "";
        const phone = student.phoneNo || "";
        return (
          name.toLowerCase().includes(query) ||
          email.toLowerCase().includes(query) ||
          roll.toLowerCase().includes(query) ||
          phone.toLowerCase().includes(query)
        );
      });
    }
    return list;
  }, [
    allStudents,
    searchQuery,
    selectedClass,
    selectedSection,
    selectedClassIdForFetch,
    students,
  ]);

  const selectedClassObj = availableClasses.find(
    (item) =>
      item.name === selectedClass &&
      (!selectedSection || item.section === selectedSection)
  );

  const handleFormChange = (key: keyof StudentFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };


  const handleEditChange = (key: keyof StudentFormState, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
    setEditErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSaveStudent = async () => {
    const nextErrors = validateForm(form, {
      requireAadhaar: true,
      requirePhone: true,
      requireClass: true,
      requireGender: true,
      strictOptionalFormats: true,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const aadhaarDigits = form.aadhaarNo.replace(/\D/g, "");
    const phoneDigits = form.phoneNo.replace(/\D/g, "");

    try {
      setSaving(true);
      const classIdPayload = form.classId?.trim() ? form.classId.trim() : undefined;
      const res: Response = await addStudent({
        name: form.name.trim(),
        fatherName: form.fatherName.trim(),
        motherName: form.motherName?.trim() || undefined,
        occupation: form.occupation?.trim() || undefined,
        aadhaarNo: aadhaarDigits,
        phoneNo: phoneDigits,
        /** Parent/guardian contact only — student login email is always auto-generated on the server */
        email: form.email.trim() || undefined,
        parentEmail: form.email.trim() || undefined,
        dob: form.dob,
        classId: classIdPayload,
        address: form.address?.trim() || undefined,
        rollNo: form.rollNo?.trim() || undefined,
        penNumber: form.penNumber?.trim() || undefined,
        apaarId: form.apaarId?.trim() || undefined,
        gender: form.gender?.trim() || undefined,
        residencyType: form.residencyType?.trim() || "Day Scholar",
        status: form.status || "Active",
      });

      const data = await res.json();

      if (!res.ok) {
        const rawMessage = typeof data.message === "string" ? data.message : "";
        const lowerRaw = rawMessage.toLowerCase();
        const message = formatStudentMessage(rawMessage || "Failed to add student");

        // Use raw API text for classification: formatted `message` can match the generic
        // "timelly id already exists" substring even for the name+ID combined error.
        if (lowerRaw.includes("student name and timelly id already exist")) {
          setErrors((prev) => ({
            ...prev,
            name: "Already exist.",
            rollNo: "Already exist.",
          }));
        } else if (
          lowerRaw.includes("timelly id already exists") ||
          lowerRaw.includes("timelly id is already used")
        ) {
          setErrors((prev) => ({ ...prev, rollNo: "Already exist." }));
        }

        toast.error(message);
        return;
      }

      // Student is already created with classId in the create API, so no need for separate assignment
      toast.success("Student added successfully");
      setShowSuccess(true);
      setForm({ ...DEFAULT_FORM, classId: form.classId });
      setShowAddForm(false);

      // Defer heavy list refresh + router refresh so the main thread stays responsive (avoids "Page unresponsive").
      window.setTimeout(() => {
        try {
          void refresh();
          if (!selectedClass) void fetchAllStudents();
          bumpAfterMutation();
        } catch {
          /* ignore */
        }
      }, 0);
    } catch (e) {
      const message =
        e instanceof Error && e.message
          ? e.message
          : "Something went wrong while adding student";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetForm = () => {
    setForm({ ...DEFAULT_FORM });
    setErrors({});
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      const message = "Please select an Excel/CSV file";
      toast.error(message);
      throw new Error(message);
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("file", uploadFile);

      const uploadRes = await fetch("/api/student/bulk-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        const message = formatStudentMessage(uploadData.message || "Upload failed");
        toast.error(message);
        throw new Error(message);
      }

      if ((uploadData.createdCount || 0) === 0 && (uploadData.failedCount || 0) > 0) {
        const firstFailed =
          Array.isArray(uploadData.failed) && uploadData.failed.length > 0
            ? uploadData.failed[0]
            : null;
        const message = firstFailed?.error
          ? `Upload failed at row ${firstFailed.row}: ${formatStudentMessage(firstFailed.error)}`
          : "Upload failed. No students were created.";
        toast.error(message);
        throw new Error(message);
      }

      toast.success(
        `${uploadData.createdCount || 0} students added successfully`
      );
      setUploadFile(null);
      refresh();
      if (!selectedClass) {
        fetchAllStudents();
      }
      bumpAfterMutation();
      return {
        createdCount: uploadData.createdCount || 0,
        failedCount: uploadData.failedCount || 0,
        failed: Array.isArray(uploadData.failed) ? uploadData.failed : [],
      };
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      throw new Error("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const openView = (student: StudentRow) => setViewStudent(student);

  const openEdit = (student: StudentRow) => {
    setShowAddForm(false);
    setShowUploadPanel(false);
    setEditStudent(student);
    setEditForm(toStudentForm(student));
    setEditErrors({});
    void (async () => {
      try {
        const res = await fetch(`/api/student/${encodeURIComponent(student.id)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.student) return;
        setEditForm((prev) => ({
          ...prev,
          name: data.student.name || prev.name,
          rollNo: data.student.rollNo || prev.rollNo,
          penNumber: data.student.penNumber || prev.penNumber,
          apaarId: data.student.apaarId || prev.apaarId,
          gender: data.student.gender || prev.gender,
          residencyType: data.student.residencyType || prev.residencyType,
          dob: data.student.dob || prev.dob,
          classId: data.student.class?.id || prev.classId,
          section: data.student.class?.section || prev.section,
          fatherName: data.student.fatherName || prev.fatherName,
          motherName: data.student.motherName || prev.motherName,
          occupation: data.student.fatherOccupation || prev.occupation,
          officeAddress: data.student.officeAddress || prev.officeAddress,
          phoneNo: data.student.phone || prev.phoneNo,
          email: data.student.parentEmail || data.student.email || prev.email,
          address: data.student.address || prev.address,
          aadhaarNo: data.student.aadhaarNo || prev.aadhaarNo,
          parentAadharNo: data.student.parentAadharNo || prev.parentAadharNo,
          parentWhatsapp: data.student.parentWhatsapp || prev.parentWhatsapp,
          bankAccountNo: data.student.bankAccountNo || prev.bankAccountNo,
          applicationFee:
            data.student.applicationFee != null
              ? String(data.student.applicationFee)
              : prev.applicationFee,
          admissionFee:
            data.student.admissionFee != null ? String(data.student.admissionFee) : prev.admissionFee,
          previousSchool: data.student.previousSchool || prev.previousSchool,
          houseNo: data.student.houseNo || prev.houseNo,
          street: data.student.street || prev.street,
          city: data.student.city || prev.city,
          town: data.student.town || prev.town,
          state: data.student.state || prev.state,
          pinCode: data.student.pinCode || prev.pinCode,
          nationality: data.student.nationality || prev.nationality,
          languagesAtHome: data.student.languagesAtHome || prev.languagesAtHome,
          caste: data.student.caste || prev.caste,
          religion: data.student.religion || prev.religion,
          emergencyFatherNo: data.student.emergencyFatherNo || prev.emergencyFatherNo,
          emergencyMotherNo: data.student.emergencyMotherNo || prev.emergencyMotherNo,
          emergencyGuardianNo: data.student.emergencyGuardianNo || prev.emergencyGuardianNo,
        }));
      } catch {
        // keep defaults from list row
      }
    })();
  };

  const openDelete = (student: StudentRow) => setDeleteStudent(student);

  const closeView = () => setViewStudent(null);
  const closeEdit = () => setEditStudent(null);
  const closeDelete = () => setDeleteStudent(null);

  const handleEditSave = async () => {
    if (!editStudent) return;
    const nextErrors = validateForm(editForm, {
      requireAadhaar: false,
      requirePhone: false,
    });
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setEditSaving(true);
    try {
      const res = await updateStudent(editStudent.id, {
        name: editForm.name.trim(),
        fatherName: editForm.fatherName.trim(),
        motherName: editForm.motherName.trim() || undefined,
        occupation: editForm.occupation.trim() || undefined,
        classId: editForm.classId || undefined,
        dob: editForm.dob || undefined,
        aadhaarNo: editForm.aadhaarNo.trim() || undefined,
        rollNo: editForm.rollNo.trim() || undefined,
        penNumber: editForm.penNumber.trim() || undefined,
        apaarId: editForm.apaarId.trim() || undefined,
        phoneNo: editForm.phoneNo.trim() || undefined,
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        gender: editForm.gender.trim() || undefined,
        residencyType: editForm.residencyType?.trim() || "Day Scholar",
        parentAadharNo: editForm.parentAadharNo.trim() || undefined,
        parentWhatsapp: editForm.parentWhatsapp.trim() || undefined,
        bankAccountNo: editForm.bankAccountNo.trim() || undefined,
        officeAddress: editForm.officeAddress.trim() || undefined,
        houseNo: editForm.houseNo.trim() || undefined,
        street: editForm.street.trim() || undefined,
        city: editForm.city.trim() || undefined,
        town: editForm.town.trim() || undefined,
        state: editForm.state.trim() || undefined,
        pinCode: editForm.pinCode.trim() || undefined,
        nationality: editForm.nationality.trim() || undefined,
        languagesAtHome: editForm.languagesAtHome.trim() || undefined,
        caste: editForm.caste.trim() || undefined,
        religion: editForm.religion.trim() || undefined,
        emergencyFatherNo: editForm.emergencyFatherNo.trim() || undefined,
        emergencyMotherNo: editForm.emergencyMotherNo.trim() || undefined,
        emergencyGuardianNo: editForm.emergencyGuardianNo.trim() || undefined,
        applicationFee: editForm.applicationFee.trim()
          ? Number(editForm.applicationFee)
          : null,
        admissionFee: editForm.admissionFee.trim() ? Number(editForm.admissionFee) : null,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to update student");
        return;
      }

      const resolvedClass = editForm.classId
        ? availableClasses.find((c) => c.id === editForm.classId) ?? null
        : null;
      const updated = mergeStudentAfterEdit(editStudent, editForm, resolvedClass);
      const updatedClassId = updated.class?.id;

      const movedOutOfFilteredClass =
        Boolean(selectedClassIdForFetch) &&
        Boolean(updatedClassId) &&
        updatedClassId !== selectedClassIdForFetch;

      if (selectedClassIdForFetch) {
        if (movedOutOfFilteredClass) {
          removeStudent(editStudent.id);
        } else {
          patchStudent(editStudent.id, () => updated);
        }
      }

      setAllStudents((prev) =>
        prev.map((s) => (s.id === editStudent.id ? updated : s))
      );

      toast.success("Student updated successfully");
      closeEdit();

      void refreshSilent();
      void fetchAllStudents({ silent: true });
      bumpAfterMutation();
    } catch {
      toast.error("Failed to update student");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteStudent) return;
    const student = deleteStudent;
    try {
      const res = await deleteStudentApi(student.id);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Failed to delete student");
        return;
      }
      toast.success("Student deleted successfully");
      closeDelete();
      refresh();
      if (!selectedClassIdForFetch) fetchAllStudents();
      bumpAfterMutation();
    } catch {
      toast.error("Failed to delete student");
    }
  };

  const handleDownloadReport = async () => {
    if (exportingDetails) return;
    setExportingDetails(true);
    try {
      const params = new URLSearchParams();
      if (selectedClassIdForFetch) {
        params.set("classId", selectedClassIdForFetch);
      } else {
        if (selectedClass) params.set("className", selectedClass);
        if (selectedSection) params.set("section", selectedSection);
      }
      const res = await fetch(
        `/api/student/export-details?${params.toString()}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) {
        let message = "Export failed";
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data.message === "string" && data.message) {
            message = data.message;
          }
        } catch {
          /* ignore */
        }
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Student-details-report.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExportingDetails(false);
    }
  };

  return {
    filterClassOptions,
    filterSectionOptions,
    formClassOptions,
    formSectionOptions,
    classesLoading,
    selectedClass,
    setSelectedClass,
    selectedSection,
    setSelectedSection,
    searchQuery,
    setSearchQuery,
    showAddForm,
    setShowAddForm,
    showUploadPanel,
    setShowUploadPanel,
    uploadFile,
    setUploadFile,
    uploading,
    handleUpload,
    form,
    errors,
    saving,
    handleFormChange,
    handleResetForm,
    handleSaveStudent,
    filteredStudents,
    tableLoading: selectedClass ? loading : allLoading,
    selectedClassObj,
    viewStudent,
    editStudent,
    deleteStudent,
    editForm,
    setEditForm,
    editErrors,
    editSaving,
    handleEditChange,
    openView,
    openEdit,
    openDelete,
    closeView,
    closeEdit,
    closeDelete,
    handleEditSave,
    handleDelete,
    handleDownloadReport,
    exportingDetails,
    showSuccess,
    setShowSuccess,
  };
}
