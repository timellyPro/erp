import { ClassItem, StudentFormState, StudentRow } from "./types";

export const getInitials = (name?: string | null) => {
  if (!name) return "ST";
  const parts = name.trim().split(" ").filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
};

export const getAge = (dob?: string | null) => {
  if (!dob) return "-";
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return "-";
  const diff = Date.now() - date.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970).toString();
};

export const toStudentForm = (student: StudentRow): StudentFormState => ({
  name: student.user?.name || student.name || "",
  rollNo: student.rollNo || "",
  gender: student.gender || "",
  residencyType: student.residencyType || "Day Scholar",
  dob: student.dob || "",
  classId: student.class?.id || "",
  section: student.class?.section || "",
  status: student.status || "Active",
  fatherName: student.fatherName || "",
  motherName: (student as { motherName?: string }).motherName || "",
  occupation: (student as { occupation?: string }).occupation || "",
  officeAddress: "",
  phoneNo: student.phoneNo || "",
  email: student.user?.email || (student as { email?: string }).email || "",
  address: student.address || "",
  aadhaarNo: student.aadhaarNo || "",
  parentAadharNo: (student as { parentAadharNo?: string }).parentAadharNo || "",
  parentWhatsapp: "",
  bankAccountNo: "",
  totalFee: "",
  discountPercent: "",
  applicationFee:
    student.applicationFee != null && student.applicationFee !== undefined
      ? String(student.applicationFee)
      : "",
  admissionFee:
    student.admissionFee != null && student.admissionFee !== undefined
      ? String(student.admissionFee)
      : "",
  previousSchool: student.previousSchool || "",
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
});

/** Merge edit form values into a list row for immediate UI updates after a successful save. */
export function mergeStudentAfterEdit(
  prev: StudentRow,
  form: StudentFormState,
  resolvedClass: ClassItem | null
): StudentRow {
  const name = form.name.trim() || prev.user?.name || prev.name || "";

  let nextClass = prev.class ?? null;
  if (form.classId && resolvedClass?.id === form.classId) {
    nextClass = {
      id: resolvedClass.id,
      name: resolvedClass.name,
      section: resolvedClass.section || "",
    };
  }

  return {
    ...prev,
    name,
    rollNo: form.rollNo.trim() || prev.rollNo,
    fatherName: form.fatherName.trim() || prev.fatherName,
    motherName: form.motherName.trim() || prev.motherName,
    occupation: form.occupation.trim() || prev.occupation,
    phoneNo: form.phoneNo.trim() || prev.phoneNo,
    address: form.address.trim() || prev.address,
    gender: form.gender.trim() || prev.gender,
    residencyType: form.residencyType.trim() || prev.residencyType,
    previousSchool: form.previousSchool.trim() || prev.previousSchool,
    status: form.status || prev.status,
    class: nextClass,
    user: prev.user ? { ...prev.user, name } : prev.user,
  };
}
