"use client";

import { motion } from "framer-motion";
import {
    X,
    Clock,
    Check,
    Plus,
    CircleCheckBig,
    Save,
    GraduationCap,
} from "lucide-react";
import { useClasses } from "@/app/_components/hooks/useClasses";
import { useCircularFormState } from "./shared";
import { CIRCULAR_RECIPIENTS, IMPORTANCE_LEVELS, PUBLISH_STATUS } from "./shared";

type Props = {
    onClose: () => void;
    onSuccess: () => void;
};

/* -------------------- component -------------------- */

export default function CircularForm({ onClose, onSuccess }: Props) {
    const { classes } = useClasses();
    const {
        submitting,
        error,
        attachmentUploading,
        selected,
        setSelected,
        fileInputRef,
        form,
        setForm,
        handleAttachFile,
        removeAttachment,
        toggleRecipient,
        handleSubmit,
    } = useCircularFormState({ onClose, onSuccess });

    return (
        <div className="bg-[#0F172A] border border-lime-400/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-fadeIn">
            <div className="absolute top-0 left-0 w-1 h-full bg-lime-400"></div>
            {/* header */}
            <div className="flex justify-between items-center mb-6 pl-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Plus size={20} className="inline mr-2" /> New Circular
                </h2>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white"
                >
                    <X size={20} />
                </button>
            </div>

            {/* form */}
            <form onSubmit={handleSubmit} className="space-y-6 pl-2">
                {/* reference + date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Reference Number</label>
                        <input
                            placeholder="Reference Number"
                            value={form.referenceNumber}
                            onChange={(e) =>
                                setForm({ ...form, referenceNumber: e.target.value })
                            }
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-gray-200 focus:outline-none focus:border-lime-400/50"
                        />
                    </div>
                    <div>
                        <label htmlFor="date" className="block text-xs font-medium text-gray-400 mb-1.5">Date</label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={(e) =>
                                setForm({ ...form, date: e.target.value })
                            }
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-gray-200 focus:outline-none focus:border-lime-400/50"
                        />
                    </div>
                    {/* subject */}
                    <div className="w-full md:col-span-2    ">
                        <label htmlFor="" className="block text-xs font-medium text-gray-400 mb-1.5">Subject / Title *</label>
                        <input
                            type="text"
                            value={form.subject}
                            onChange={(e) =>
                                setForm({ ...form, subject: e.target.value })
                            }
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-gray-200 focus:outline-none focus:border-lime-400/50"
                        />
                    </div>
                </div>
                {/* content */}
                <div>
                    <label htmlFor="content" className="block text-xs font-medium text-gray-400 mb-1.5">Content *</label>
                    <textarea
                        required
                        rows={5}
                        placeholder="Circular content..."
                        value={form.content}
                        onChange={(e) =>
                            setForm({ ...form, content: e.target.value })
                        }
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-gray-200 focus:outline-none focus:border-lime-400/50"
                    />
                </div>
                <div>
                    <label htmlFor="" className="block text-xs font-medium text-gray-400 mb-2">Attachments</label>
                    <div className="flex flex-wrap gap-3 mb-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={handleAttachFile}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={attachmentUploading}
                            className="px-3 py-2 bg-white/5 border border-dashed border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-lime-400/50 hover:bg-lime-400/5 transition-all flex items-center gap-2 disabled:opacity-60"
                        >
                            {attachmentUploading ? "Uploading…" : "Attach Document"}
                        </button>
                        {form.attachments.map((url, i) => (
                            <span
                                key={url}
                                className="px-3 py-2 bg-lime-400/10 border border-lime-400/30 rounded-lg text-xs text-lime-400 flex items-center gap-2"
                            >
                                <a href={url} target="_blank" rel="noopener noreferrer" className="truncate max-w-[120px]">
                                    Attachment {i + 1}
                                </a>
                                <button type="button" onClick={() => removeAttachment(i)} className="text-red-400 hover:text-red-300">×</button>
                            </span>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="" className="block text-xs font-medium text-gray-400 mb-1.5">Issued by</label>
                        <input type="text" value={form.issuedBy} onChange={(e) => setForm({ ...form, issuedBy: e.target.value })} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-gray-200 focus:outline-none focus:border-lime-400/50" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Importance</label>
                        {/* importance */}
                        <div className="flex bg-black/20 rounded-xl p-1 border border-white/10">
                            {IMPORTANCE_LEVELS.map(({ label, activeClass }) => {
                                const isActive = selected === label;

                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => {
                                            setSelected(label);
                                            setForm((f) => ({ ...f, importanceLevel: label }));
                                        }}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
          ${isActive
                                                ? activeClass
                                                : "text-gray-400 hover:text-gray-200"
                                            }`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>


                    </div>
                </div>


                {/* target class - class-wise circular */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                        <GraduationCap size={14} /> Target Class (optional)
                    </label>
                    <p className="text-xs text-white/50 mb-2">
                        Leave empty for school-wide. Select a class to target students, parents, or teachers of that class only.
                    </p>
                    <select
                        value={form.classId}
                        onChange={(e) => setForm({ ...form, classId: e.target.value })}
                        className="w-full max-w-xs bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-gray-200 focus:outline-none focus:border-lime-400/50"
                    >
                        <option value="" className="bg-gray-900 text-white">All classes (school-wide)</option>
                        {classes.map((c) => (
                            <option key={c.id} value={c.id} className="bg-gray-900 text-white">
                                {c.name}{c.section ? ` - ${c.section}` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                {/* recipients */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                        Recipients
                    </label>
                    <p className="text-xs text-white/50 mb-2">
                        Choose who receives this circular. If classes are selected above, students/parents/teachers apply to those classes only.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {CIRCULAR_RECIPIENTS.map((r) => {
                            const isSelected = form.recipients.includes(r.value);
                            return (
                                <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => toggleRecipient(r.value)}
                                    className={`
                                        px-3 py-1.5 rounded-lg text-xs font-medium border
                                        transition-all flex items-center gap-1.5
                                        ${isSelected ? "bg-lime-400/20 text-lime-400 border-lime-400/50" : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"}
                                    `}
                                >
                                    {isSelected && (
                                        <span className="w-3.5 h-3.5 rounded-full bg-lime-400 flex items-center justify-center">
                                            <Check size={10} className="text-black" />
                                        </span>
                                    )}
                                    {r.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {/* publish status */}




                <div className="flex flex-wrap gap-6">
                    {/* Publish Now */}
                    <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-300">
                        {form.publishStatus === PUBLISH_STATUS.PUBLISHED ? (
                            <CircleCheckBig className="w-5 h-5 text-green-500" />
                        ) : (
                            <input
                                type="radio"
                                name="publishStatus"
                                checked={false}
                                onChange={() =>
                                    setForm({
                                        ...form,
                                        publishStatus: PUBLISH_STATUS.PUBLISHED,
                                    })
                                }
                                className="accent-green-500 w-4 h-4"
                            />
                        )}

                        <span>Publish Immediately</span>
                    </label>

                    {/* Save as Draft */}
                    <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-300">
                        {form.publishStatus === PUBLISH_STATUS.DRAFT ? (
                            <Clock className="w-5 h-5 text-yellow-400" />
                        ) : (
                            <input
                                type="radio"
                                name="publishStatus"
                                checked={false}
                                onChange={() =>
                                    setForm({
                                        ...form,
                                        publishStatus: PUBLISH_STATUS.DRAFT,
                                    })
                                }
                                className="accent-yellow-400 w-4 h-4 "
                            />
                        )}

                        <span>Save as Draft</span>
                    </label>
                </div>



                {error && (
                    <div className="rounded-xl bg-red-500/20 border border-red-500/30 px-4 py-3 text-red-300 text-sm">
                        {error}
                    </div>
                )}

                {/* actions */}
                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl border border-white/10 text-gray-400 font-medium hover:bg-white/5 transition-all"
                    >
                        Cancel
                    </button>

                    <motion.button
                        type="submit"
                        disabled={submitting}
                        whileTap={{ scale: submitting ? 1 : 0.97 }}
                        className="px-6 py-2.5 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl shadow-lg shadow-lime-400/20 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <Save size={18} className="inline" />
                        {submitting ? "Creating…" : "Create Circular"}
                    </motion.button>
                </div>
            </form>
        </div>
    );
}
