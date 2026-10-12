"use client";

import { useEffect, useState, useRef } from "react";
import { Calendar, Upload } from "lucide-react";
import type { HomeworkItem, ClassOption } from "./types";
import { SUBJECT_OPTIONS } from "./types";
import { uploadImage } from "../../../utils/upload";

type Props = {
  classes: ClassOption[];
  editing: HomeworkItem | null;
  onCancel: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    classId: string;
    subject: string;
    dueDate: string;
    assignedDate: string;
    file?: string | null;
  }) => Promise<void>;
};

export default function HomeworkForm({ classes, editing, onCancel, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedDate, setAssignedDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description);
      setClassId(editing.class?.id ?? "");
      setSubject(editing.subject);
      setDueDate(editing.dueDate ? editing.dueDate.slice(0, 10) : "");
      setAssignedDate(
        editing.assignedDate ? String(editing.assignedDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
      );
      setFileUrl(editing.file ?? null);
      setFile(null);
    } else {
      setTitle("");
      setDescription("");
      setClassId(classes[0]?.id ?? "");
      setSubject(SUBJECT_OPTIONS[0] ?? "Mathematics");
      setDueDate("");
      setAssignedDate(new Date().toISOString().slice(0, 10));
      setFileUrl(null);
      setFile(null);
    }
  }, [editing, classes]);

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (!classId) {
      setError("Please select a class");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required");
      return;
    }
    setSaving(true);
    try {
      let finalFileUrl: string | null = fileUrl;
      if (file) {
        finalFileUrl = await uploadImage(file, "homework");
      }
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        classId,
        subject: subject.trim(),
        dueDate: dueDate || new Date().toISOString().slice(0, 10),
        assignedDate: assignedDate || new Date().toISOString().slice(0, 10),
        file: finalFileUrl ?? undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl mb-8 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="px-6 md:px-8 py-4 md:py-6 border-b border-white/10">
        <h3 className="text-lg md:text-xl font-semibold">
          {editing ? "Edit Assignment" : "New Assignment Details"}
        </h3>
      </div>


      <ul className="px-6 md:px-8 py-6 md:py-8 space-y-6">
        <li className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs md:text-sm text-white/60 block mb-2 uppercase tracking-wider">
              Class
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="input h-12 md:h-14 w-full bg-black/40 border border-white/10 rounded-xl px-4 outline-none focus:border-lime-400/50"
            >
              <option value="" className="bg-slate-900">
                Select class
              </option>
              {classes.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900">
                  {c.name}
                  {c.section ? `-${c.section}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs md:text-sm text-white/60 block mb-2 uppercase tracking-wider">
              Subject
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input h-12 md:h-14 w-full bg-black/40 border border-white/10 rounded-xl px-4 outline-none focus:border-lime-400/50"
            >
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </div>
        </li>

        <li>
          <label className="text-xs md:text-sm text-white/60 block mb-2 uppercase tracking-wider">
            Assignment Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input h-12 md:h-14 w-full bg-black/40 border border-white/10 rounded-xl px-4 outline-none focus:border-lime-400/50"
            placeholder="e.g. Chapter 5: Quadratic Equations"
          />
        </li>

        <li className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative">
            <label className="text-xs md:text-sm text-white/60 block mb-2 uppercase tracking-wider">
              Assigned Date
            </label>
            <input
              type="date"
              value={assignedDate}
              onChange={(e) => setAssignedDate(e.target.value)}
              className="input h-12 md:h-14 w-full bg-black/40 border border-white/10 rounded-xl px-4 outline-none focus:border-lime-400/50 [color-scheme:dark]"
            />
            <Calendar
              className="absolute right-4 top-10 md:top-11 text-white/60 cursor-pointer hover:text-lime-400 transition-colors pointer-events-none"
              size={18}
            />
          </div>

          <div className="relative">
            <label className="text-xs md:text-sm text-white/60 block mb-2 uppercase tracking-wider">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input h-12 md:h-14 w-full bg-black/40 border border-white/10 rounded-xl px-4 outline-none focus:border-lime-400/50 [color-scheme:dark]"
            />
            <Calendar
              className="absolute right-4 top-10 md:top-11 text-white/60 cursor-pointer hover:text-lime-400 transition-colors pointer-events-none"
              size={18}
            />
          </div>
        </li>

        <li>
          <label className="text-xs md:text-sm text-white/60 block mb-3 uppercase tracking-wider">
            Description
          </label>
          <div className="rounded-2xl bg-black/30 border border-white/10 overflow-hidden">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-32 md:h-40 bg-transparent px-4 md:px-6 py-4 text-white placeholder:text-white/40 resize-none outline-none"
              placeholder="Enter assignment details..."
            />
          </div>
        </li>

        <li>
          <label className="text-xs md:text-sm text-white/60 block mb-3 uppercase tracking-wider">
            Attachments
          </label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="cursor-pointer rounded-2xl border border-dashed border-lime-400/40 p-6 md:p-10 text-center bg-black/30 hover:bg-black/40 transition"
          >
            <Upload size={26} className="mx-auto mb-3 text-white/60" />
            <p className="text-sm font-medium text-white/80">Click to upload files</p>
            <p className="text-xs text-white/50 mt-1">
              PDF, DOC, DOCX, JPG up to 10MB
            </p>
            {(file || fileUrl) && (
              <p className="mt-3 text-lime-400 text-sm font-medium">
                {file ? file.name : "Current attachment"}
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ?? null);
              if (!f) setFileUrl((prev) => (editing?.file ? prev : null));
            }}
          />
        </li>

        {error && (
          <li>
            <p className="text-sm text-red-400">{error}</p>
          </li>
        )}
      </ul>

      <div className="px-6 md:px-8 py-4 md:py-6 border-t border-white/10 flex flex-col sm:flex-row justify-end gap-3 md:gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full sm:w-auto px-8 py-3 rounded-full bg-lime-400 text-black font-bold shadow-lg shadow-lime-400/10 active:scale-95 transition-transform disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Update Assignment" : "Assign Homework"}
        </button>
      </div>
    </div>
  );
}
