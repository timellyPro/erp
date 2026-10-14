"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { updateUser } from "@/lib/api/user";
import type { TeacherRow } from "./TeachersList";

interface Props {
  teacher: TeacherRow;
  onClose: () => void;
  onSave: (updatedTeacher: TeacherRow) => void;
}

const EditTeacher = ({ teacher, onClose, onSave }: Props) => {
  const [formData, setFormData] = useState<TeacherRow>(teacher);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "auto";
    };
  }, []);

  useEffect(() => {
    setFormData(teacher);
  }, [teacher]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value } as TeacherRow));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { ok, data } = await updateUser(teacher.id, {
        name: formData.name,
        teacherId: formData.teacherId,
        designation: formData.subject,
        mobile: formData.phone,
        photoUrl: formData.avatar,
      });
      if (!ok) throw new Error(data?.message || "Failed to update teacher.");

      const updated = data?.user || {};
      onSave({
        ...formData,
        name: updated.name ?? formData.name,
        teacherId: updated.teacherId ?? formData.teacherId,
        subject: updated.subject ?? updated.designation ?? formData.subject,
        phone: updated.mobile ?? formData.phone,
        avatar: updated.photoUrl ?? formData.avatar,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("teacher-profile-updated", {
            detail: {
              teacherId: teacher.id,
              photoUrl: updated.photoUrl ?? formData.avatar,
            },
          })
        );
        localStorage.setItem("timelly:profile-updated", String(Date.now()));
      }

      onClose();
    } catch (e) {
      if (typeof window !== "undefined") {
        window.alert(e instanceof Error ? e.message : "Failed to update teacher.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      {/* Modal */}
      <div className="relative z-10 max-w-6xl max-h-[92vh] rounded-3xl bg-gradient-to-br from-[#0B1B34] to-[#0F172A] border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Edit Teacher</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Input
              label="Teacher Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />

            <Input
              label="Teacher Code"
              name="teacherId"
              value={formData.teacherId}
              onChange={handleChange}
            />

            <Input
              label="Subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
            />

            <Input
              label="Phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
            />

            <Input
              label="Avatar URL"
              name="avatar"
              value={formData.avatar}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/10 flex justify-end gap-4 bg-[#0F172A]">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-white/5 text-gray-300"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 rounded-2xl bg-lime-400 text-black font-semibold disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default EditTeacher;

/* Reusable Input */
const Input = ({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div>
    <label className="text-sm text-gray-400">{label}</label>
    <input
      name={name}
      value={value}
      onChange={onChange}
      className="mt-2 w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-white"
    />
  </div>
);
