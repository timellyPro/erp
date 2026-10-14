export type UserFormDataForValidation = {
  name: string;
  email?: string;
  role: "SCHOOLADMIN" | "TEACHER" | "STUDENT";
  designation?: string;
  password?: string;
  confirmPassword?: string;
  allowedFeatures: string[];
  teacherId?: string;
  subjects?: string[];
  qualification?: string;
  experience?: string;
  joiningDate?: string;
  teacherStatus?: string;
  mobile?: string;
  address?: string;
};

export type UserFormFieldErrorKey =
  | "name"
  | "designation"
  | "password"
  | "confirmPassword"
  | "allowedFeatures"
  | "teacherId"
  | "subjects"
  | "qualification"
  | "experience"
  | "joiningDate"
  | "mobile"
  | "address";

export type UserFormErrors = Partial<Record<UserFormFieldErrorKey, string>>;

const JOINING_DATE_DDMMYYYY = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;

function isValidJoiningDate(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  const m = t.match(JOINING_DATE_DDMMYYYY);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    const dt = new Date(y, mo - 1, d);
    return (
      dt.getFullYear() === y &&
      dt.getMonth() === mo - 1 &&
      dt.getDate() === d
    );
  }
  const iso = new Date(t);
  return !Number.isNaN(iso.getTime());
}

/**
 * Client-side validation aligned with `/api/user/create` and `/api/user/[id]` expectations.
 */
export function validateUserForm(
  formData: UserFormDataForValidation,
  mode: "create" | "edit"
): UserFormErrors {
  const errors: UserFormErrors = {};

  const name = formData.name.trim();
  if (!name) {
    errors.name = "Full name is required";
  } else if (name.length < 2) {
    errors.name = "Name must be at least 2 characters";
  } else if (name.length > 100) {
    errors.name = "Name must be at most 100 characters";
  }

  const designation = (formData.designation || "").trim();
  if (designation && designation.length < 2) {
    errors.designation = "Designation must be at least 2 characters when provided";
  } else if (designation.length > 120) {
    errors.designation = "Designation must be at most 120 characters";
  }

  const password = formData.password || "";
  const confirm = formData.confirmPassword || "";

  if (mode === "create") {
    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    } else if (password.length > 128) {
      errors.password = "Password must be at most 128 characters";
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      errors.password = "Include at least one letter and one number";
    }
  } else if (password) {
    if (password.length < 8) {
      errors.password = "New password must be at least 8 characters";
    } else if (password.length > 128) {
      errors.password = "Password must be at most 128 characters";
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      errors.password = "Include at least one letter and one number";
    }
  }

  if (password) {
    if (confirm !== password) {
      errors.confirmPassword = "Passwords do not match";
    }
  }

  if (!formData.allowedFeatures?.length) {
    errors.allowedFeatures =
      "Select at least one module under Access Control (or use Select All)";
  }

  if (formData.role === "TEACHER") {
    const subjects = formData.subjects || [];
    if (!subjects.length) {
      errors.subjects = "Add at least one subject";
    } else if (subjects.some((s) => s.trim().length < 1 || s.length > 80)) {
      errors.subjects = "Each subject must be 1–80 characters";
    }

    const teacherId = (formData.teacherId || "").trim();
    if (teacherId) {
      if (!/^[A-Za-z0-9\-_]+$/.test(teacherId)) {
        errors.teacherId = "Use only letters, numbers, hyphens, or underscores";
      } else if (teacherId.length > 40) {
        errors.teacherId = "Teacher ID must be at most 40 characters";
      }
    }

    const qualification = (formData.qualification || "").trim();
    if (qualification && qualification.length < 2) {
      errors.qualification = "Qualification must be at least 2 characters when provided";
    } else if (qualification.length > 120) {
      errors.qualification = "Qualification must be at most 120 characters";
    }

    const experience = (formData.experience || "").trim();
    if (experience.length > 80) {
      errors.experience = "Experience must be at most 80 characters";
    }

    const joiningDate = (formData.joiningDate || "").trim();
    if (joiningDate && !isValidJoiningDate(joiningDate)) {
      errors.joiningDate = "Use a valid date (calendar pick, yyyy-mm-dd, or dd-mm-yyyy)";
    }

    const mobileDigits = (formData.mobile || "").replace(/\D/g, "");
    if ((formData.mobile || "").trim() && mobileDigits.length !== 10) {
      errors.mobile = "Phone must be exactly 10 digits";
    }

    const address = (formData.address || "").trim();
    if (address && address.length < 5) {
      errors.address = "Address must be at least 5 characters when provided";
    } else if (address.length > 500) {
      errors.address = "Address must be at most 500 characters";
    }
  }

  return errors;
}
