"use client";

import { useEffect, useState } from "react";
import { Pencil, X, Save } from "lucide-react";
import { fetchClass, updateClass } from "@/lib/api/classes";
import { fetchClassList } from "@/lib/api/classList";
import { fetchTeacherList } from "@/lib/api/teacher";
import SearchInput from "../../common/SearchInput";
import SelectInput from "../../common/SelectInput";

type ClassRow = {
  id: string;
  name: string;
  section: string;
  students: number;
  teacher: string;
  subject: string;
};

interface EditClassPanelProps {
  row: ClassRow;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EditClassPanel({
  row,
  onClose,
  onSuccess,
}: EditClassPanelProps) {
  const [className, setClassName] = useState(row.name);
  const [section, setSection] = useState(row.section.replace("Section ", ""));
  const [teacherId, setTeacherId] = useState<string>("");
  const [sectionOptions, setSectionOptions] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [isLoadingClass, setIsLoadingClass] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadTeachers = async () => {
      setIsLoadingTeachers(true);
      try {
        const { ok, data } = await fetchTeacherList();
        if (!ok) {
          throw new Error("Failed to load teachers.");
        }
        if (isActive) {
          const list = Array.isArray(data?.teachers) ? data.teachers : [];
          setTeachers(
            list
              .map((t) => ({
                id: String(t?.id ?? ""),
                name: String(t?.name ?? "Teacher"),
              }))
              .filter((t: { id: string }) => t.id)
          );
        }
      } catch {
        if (isActive) {
          setTeachers([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingTeachers(false);
        }
      }
    };

    const loadClass = async () => {
      setIsLoadingClass(true);
      try {
        const { ok, data } = await fetchClass(row.id);
        if (!ok) {
          throw new Error("Failed to load class.");
        }
        const classData = data?.class;
        if (isActive && classData) {
          const sectionValue = classData.section ?? "";
          setSection(sectionValue);
          setTeacherId(classData?.teacher?.id ?? "");

          const listResult = await fetchClassList();
          if (listResult.ok) {
            const rows = (Array.isArray(listResult.data?.classes)
              ? listResult.data.classes
              : []) as { name?: string; section?: string | null }[];
            const matchingSections: string[] = rows
              .filter((item: { name?: string }) => item?.name === classData.name)
              .map((item: { section?: string | null }) => item?.section ?? null)
              .filter((value: string | null): value is string => {
                return typeof value === "string" && value.trim().length > 0;
              })
              .map((value: string) => value.trim());

            const uniqueSections: string[] = Array.from(
              new Set<string>(matchingSections)
            );
            if (sectionValue && !uniqueSections.includes(sectionValue)) {
              uniqueSections.unshift(sectionValue);
            }
            setSectionOptions(uniqueSections);
          } else {
            setSectionOptions(sectionValue ? [sectionValue] : []);
          }
        }
      } catch {
        if (isActive) {
          setSectionOptions([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingClass(false);
        }
      }
    };

    loadTeachers();
    loadClass();

    return () => {
      isActive = false;
    };
  }, [row.id]);

  const handleSave = async () => {
    const name = className.trim();
    if (!name) {
      setSaveError("Class name is required.");
      return;
    }
    if (!section || section === "__no_sections__") {
      setSaveError("Please select a valid section.");
      return;
    }

    setSaveError(null);
    setSaveLoading(true);
    try {
      const { ok, data } = await updateClass(row.id, {
        name,
        section,
        teacherId: teacherId === "" ? null : teacherId,
      });
      if (!ok) {
        setSaveError(data?.message || "Failed to update class.");
        return;
      }
      onSuccess?.();
      onClose();
    } catch {
      setSaveError("Failed to update class.");
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="bg-[#0F172A] p-4 shadow-inner animate-fadeIn border-y border-white/10">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400/15 border border-lime-400/30">
              <Pencil size={16} className="text-lime-400" />
            </span>
            <h3 className="text-base sm:text-lg font-semibold text-lime-300">
              Edit Class: {row.name}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close edit class"
          >
            <X size={16} className="mx-auto" />
          </button>
        </div>

        {saveError && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {saveError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_1.2fr_auto] gap-3 items-end">
          <SearchInput
            label="Class Name"
            value={className}
            onChange={setClassName}
            placeholder="Class name"
            variant="glass"
          />

          <SelectInput
            label="Section"
            value={isLoadingClass ? "" : section}
            onChange={setSection}
            options={[
              {
                label: isLoadingClass ? "Loading sections..." : "Select Section",
                value: "",
                disabled: true,
              },
              ...(sectionOptions.length > 0
                ? sectionOptions.map((option) => ({
                    label: option,
                    value: option,
                  }))
                : [
                    {
                      label: isLoadingClass ? "Loading sections..." : "No sections found",
                      value: "__no_sections__",
                      disabled: true,
                    },
                  ]),
            ]}
          />
          <SelectInput
            label="Class Teacher"
            value={teacherId}
            onChange={setTeacherId}
            options={[
              {
                label: isLoadingTeachers
                  ? "Loading teachers..."
                  : "Select Teacher",
                value: "",
                disabled: false,
              },
              ...(teachers.length > 0
                ? teachers.map((teacher) => ({
                    label: teacher.name,
                    value: teacher.id,
                  }))
                : [
                    {
                      label: "No teachers found",
                      value: "__no_teachers__",
                      disabled: true,
                    },
                  ]),
            ]}
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={saveLoading || isLoadingClass || isLoadingTeachers}
            className="h-[40px] lg:h-[46px] px-5 rounded-lg bg-lime-400 text-black font-semibold flex items-center justify-center gap-2 hover:bg-lime-300 transition text-sm disabled:opacity-50"
          >
            <Save size={16} />
            {saveLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
