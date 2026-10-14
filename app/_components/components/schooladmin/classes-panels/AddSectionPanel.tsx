"use client";

import { Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { createClass } from "@/lib/api/classes";
import { fetchClassList } from "@/lib/api/classList";
import { fetchTeacherList } from "@/lib/api/teacher";
import SearchInput from "../../common/SearchInput";
import SelectInput from "../../common/SelectInput";
import SuccessPopups from "../../common/SuccessPopUps";
import { getErrorMessage } from "@/lib/errors/errorInfo";

interface AddSectionPanelProps {
  onCancel: () => void;
  onSuccess?: () => void;
}

export default function AddSectionPanel({
  onCancel,
  onSuccess,
}: AddSectionPanelProps) {
  const [classId, setClassId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [classes, setClasses] = useState<
    { id: string; name: string; section?: string | null }[]
  >([]);
  const [teachers, setTeachers] = useState<
    { id: string; name: string; email: string; mobile?: string | null }[]
  >([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadClasses = async () => {
      setIsLoadingClasses(true);
      try {
        const { ok, data } = await fetchClassList();
        if (!ok) {
          throw new Error("Failed to load classes.");
        }
        if (isActive) {
          setClasses(Array.isArray(data?.classes) ? (data.classes as { id: string; name: string; section?: string | null }[]) : []);
        }
      } catch {
        if (isActive) {
          setClasses([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingClasses(false);
        }
      }
    };

    const loadTeachers = async () => {
      setIsLoadingTeachers(true);
      try {
        const { ok, data } = await fetchTeacherList();
        if (!ok) {
          throw new Error("Failed to load teachers.");
        }
        if (isActive) {
          setTeachers(Array.isArray(data?.teachers) ? data.teachers : []);
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

    loadClasses();
    loadTeachers();

    return () => {
      isActive = false;
    };
  }, []);

  const handleSave = async () => {
    if (!classId) {
      setError("Please select a class.");
      return;
    }
    if (!sectionName.trim()) {
      setError("Section name is required.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const selectedClass = classes.find((cls) => cls.id === classId);
      if (!selectedClass?.name) {
        throw new Error("Selected class not found.");
      }

      const { ok, data } = await createClass({
        name: selectedClass.name,
        section: sectionName.trim(),
        teacherId: teacherId || undefined,
      });

      if (!ok) {
        throw new Error(data?.message || "Failed to save section.");
      }

      setShowSuccess(true);
      setSectionName("");
      setTeacherId("");
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to save section.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[#0F172A]/50 rounded-2xl p-6 border border-white/10 animate-fadeIn shadow-inner">
      <div className="flex items-center gap-2 text-white font-semibold mb-4">
        <Plus size={18} className="text-lime-400" />
        Add New Section
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <SelectInput
          label="Select Class"
          value={classId}
          onChange={setClassId}
          options={[
            {
              label: isLoadingClasses ? "Loading classes..." : "Select Class",
              value: "",
              disabled: true,
            },
            ...(classes.length > 0
              ? classes.map((cls) => ({
                  label: `${cls.name}${cls.section ? ` - ${cls.section}` : ""}`,
                  value: cls.id,
                }))
              : [
                  {
                    label: "No classes found",
                    value: "__no_classes__",
                    disabled: true,
                  },
                ]),
          ]}
        />

        <SearchInput
          label="Section Name"
          placeholder="e.g. C"
          showSearchIcon={false}
          value={sectionName}
          onChange={setSectionName}
          error={error ?? undefined}
        />

        <SelectInput
          label="Class Teacher"
          value={teacherId}
          onChange={setTeacherId}
          options={[
            {
              label: isLoadingTeachers ? "Loading teachers..." : "Select Teacher",
              value: "",
              disabled: true,
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
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-3.5 py-2 text-xs font-semibold text-black hover:bg-lime-300 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save Section"}
        </button>
      </div>

      <SuccessPopups
        open={showSuccess}
        title="Section Created Successfully"
        onClose={() => {
          setShowSuccess(false);
          onSuccess?.();
        }}
      />
    </div>
  );
}
