"use client";

import { X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import SelectInput from "../../common/SelectInput";
import ParentTimellyLoader from "../ParentTimellyLoader";

type Teacher = {
  id: string;
  name: string | null;
  subject?: string | null;
};

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
};

export default function NewChatModal({ onClose, onSuccess }: Props) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [topic, setTopic] = useState("Academic Performance");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchTeachers = useCallback(async () => {
    setLoadingTeachers(true);
    setTeacherError(null);
    try {
      const res = await fetch("/api/teacher/list", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTeacherError(data.message || "Failed to load teachers");
        setTeachers([]);
        return;
      }
      const list = Array.isArray(data.teachers) ? data.teachers : [];
      setTeachers(list);
      if (list.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(list[0].id);
      }
    } catch {
      setTeacherError("Failed to load teachers");
      setTeachers([]);
    } finally {
      setLoadingTeachers(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const handleSubmit = async () => {
    if (!selectedTeacherId) {
      setSubmitError("Please select a teacher");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const note = [topic, message].filter(Boolean).join("\n\n");
      const res = await fetch("/api/communication/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ teacherId: selectedTeacherId, note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.message || "Request failed");
        return;
      }
      onSuccess?.();
      onClose();
    } catch {
      setSubmitError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg bg-[#0f1b2d] rounded-2xl border border-white/10 shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            New Chat Request
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">

          {/* Recipient – real teachers */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">
              SELECT RECIPIENT
            </label>
            {loadingTeachers ? (
              <ParentTimellyLoader preset="chat" compact bare className="py-4" />
            ) : teacherError ? (
              <p className="text-red-400 text-sm py-2">{teacherError}</p>
            ) : (
             <SelectInput
  value={selectedTeacherId}
  onChange={setSelectedTeacherId}
  options={[
    { label: "Select a teacher", value: "", disabled: false },
    ...teachers.map((t) => ({
      label: `${t.name ?? "Teacher"} ${t.subject ? `- ${t.subject}` : ""}`,
      value: t.id,
    })),
  ]}
  bgColor="black"
/>

            )}
          </div>

          {/* Topic */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">
              TOPIC
            </label>
            <SelectInput
  value={topic}
  onChange={setTopic}
  options={[
    { label: "Academic Performance" },
    { label: "Attendance" },
    { label: "Behavior" },
  ]}
  bgColor="black"
/>

          </div>

          {/* Message */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">
              MESSAGE
            </label>
            <textarea
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white h-32 resize-none focus:border-lime-400/50 outline-none placeholder:text-white/40"
            />
          </div>

          {submitError && (
            <p className="text-red-400 text-sm">{submitError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-6 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 text-gray-300 px-6 py-2 rounded-xl hover:bg-white/15 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || loadingTeachers || teachers.length === 0}
            className="bg-lime-400 text-black font-semibold px-6 py-2 rounded-xl hover:bg-lime-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Sending…" : "Send Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
