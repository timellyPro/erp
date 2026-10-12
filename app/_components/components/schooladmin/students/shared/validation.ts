import { StudentFormErrors, StudentFormState } from "../types";

export const formatStudentMessage = (message: string) => {
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

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateForm = (
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

  if (!form.dob || !form.dob.trim()) {
    newErrors.dob = "Please enter a valid date of birth";
  } else {
    const ymd = form.dob.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!ymd) {
      newErrors.dob = "Please enter a valid date of birth";
    } else {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const d = Number(ymd[3]);
      const today = new Date();
      const ty = today.getFullYear();
      const tm = today.getMonth() + 1;
      const td = today.getDate();
      if (y > ty || (y === ty && m > tm) || (y === ty && m === tm && d >= td)) {
        newErrors.dob = "Date of birth must be in the past";
      }
    }
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
