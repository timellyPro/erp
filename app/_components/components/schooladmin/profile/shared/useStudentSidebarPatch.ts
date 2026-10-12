import { useCallback, type MutableRefObject } from "react";
import { clearStudentListCache, writeStudentListCacheLegacy } from "@/lib/students/studentListSessionCache";
import { invalidateStudentDetailsBundleCache } from "@/lib/students/loadStudentDetailsBundle";
import type { StudentDetail, StudentOption } from "./types";

export function useStudentSidebarPatch({
  selectedIdRef,
  setStudents,
  setDetail,
  setReloadKey,
}: {
  selectedIdRef: MutableRefObject<string | null>;
  setStudents: React.Dispatch<React.SetStateAction<StudentOption[]>>;
  setDetail: React.Dispatch<React.SetStateAction<StudentDetail | null>>;
  setReloadKey: React.Dispatch<React.SetStateAction<number>>;
}) {
  const handleSidebarSaved = useCallback(
    (patch?: {
      fatherName?: string;
      fatherPhone?: string;
      motherName?: string;
      motherPhone?: string;
      name?: string;
      email?: string;
      phone?: string;
      address?: string;
      rollNo?: string;
      classId?: string | null;
      classDisplayName?: string;
      gender?: string;
      residencyType?: string;
      dob?: string;
      age?: string;
    }) => {
      if (patch) {
        const sid = selectedIdRef.current;
        if (!sid) return;
        invalidateStudentDetailsBundleCache(sid);
        clearStudentListCache();
        if (patch.name !== undefined) {
          setStudents((prev) => {
            const next = prev.map((s) => (s.id === sid ? { ...s, name: patch.name! } : s));
            writeStudentListCacheLegacy(next);
            return next;
          });
        }
        setDetail((current) => {
          if (!current) return current;
          const nextStudent = { ...current.student };
          if (patch.fatherName !== undefined) nextStudent.fatherName = patch.fatherName;
          if (patch.fatherPhone !== undefined) {
            nextStudent.fatherPhone = patch.fatherPhone;
            nextStudent.phone = patch.fatherPhone;
          }
          if (patch.motherName !== undefined) nextStudent.motherName = patch.motherName;
          if (patch.motherPhone !== undefined) nextStudent.motherPhone = patch.motherPhone;
          if (patch.name !== undefined) nextStudent.name = patch.name;
          if (patch.email !== undefined) nextStudent.email = patch.email;
          if (patch.phone !== undefined) nextStudent.phone = patch.phone;
          if (patch.address !== undefined) nextStudent.address = patch.address;
          if (patch.rollNo !== undefined) nextStudent.rollNo = patch.rollNo;
          if (patch.gender !== undefined) nextStudent.gender = patch.gender;
          if (patch.residencyType !== undefined) nextStudent.residencyType = patch.residencyType;
          if (patch.dob !== undefined) nextStudent.dob = patch.dob;
          if (patch.age !== undefined) {
            const n = Number(patch.age);
            nextStudent.age = Number.isFinite(n) ? n : nextStudent.age;
          }
          if (patch.classId !== undefined) {
            if (patch.classId && patch.classDisplayName) {
              const dash = patch.classDisplayName.indexOf(" - ");
              nextStudent.class = {
                id: patch.classId,
                name: dash > 0 ? patch.classDisplayName.slice(0, dash) : patch.classDisplayName,
                section: dash > 0 ? patch.classDisplayName.slice(dash + 3) : null,
                displayName: patch.classDisplayName.replace(" - ", "-"),
              };
            } else {
              nextStudent.class = null;
            }
          }
          return { ...current, student: nextStudent };
        });
      }
      setReloadKey((k) => k + 1);
    },
    [selectedIdRef, setStudents, setDetail, setReloadKey]
  );

  return { handleSidebarSaved };
}
