"use client";

import { useEffect, useState } from "react";
import { X, Pencil } from "lucide-react";
import { fetchTeacherDetails, type TeacherDetails } from "@/lib/api/teacher";
import { TeacherRow } from "./TeachersList";

interface Props {
    teacher: TeacherRow;
    onClose: () => void;
    onEdit: (teacher: TeacherRow) => void;
}

const ShowTeacher = ({ teacher, onClose, onEdit }: Props) => {
    const [details, setDetails] = useState<TeacherDetails | null>(null);
    const [_loading, setLoading] = useState(false);

    useEffect(() => {
        document.documentElement.style.overflow = "hidden";
        return () => {
            document.documentElement.style.overflow = "auto";
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            try {
                const { ok, data } = await fetchTeacherDetails(teacher.id);
                if (!cancelled && ok) {
                    setDetails(data.teacher || null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [teacher.id]);

    const assignedClasses = details?.assignedClasses?.length
        ? details.assignedClasses
              .map((c) => [c.name, c.section].filter(Boolean).join(c.section ? " - " : ""))
              .join(", ")
        : "-";

    const joiningDate =
        details?.joiningDate && !Number.isNaN(Date.parse(details.joiningDate))
            ? new Date(details.joiningDate).toISOString().slice(0, 10)
            : "-";

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Modal */}
            <div className="relative z-10 w-full max-w-5xl max-h-[92vh] rounded-3xl bg-gradient-to-br from-[#0B1B34] to-[#0F172A] border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-white">
                        Teacher Details
                    </h2>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 transition"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">

                    {/* Top Profile */}
                    <div className="flex items-center gap-6">
                        <img
                            src={teacher.avatar} alt={teacher.name ?? "Teacher"}
                            className="w-20 h-20 rounded-2xl object-cover border border-white/10"
                        />

                        <div>
                            <h3 className="text-xl font-bold text-white">
                                {teacher.name}
                            </h3>

                            <p className="text-gray-400 mt-1">
                                {teacher.teacherId}
                            </p>

                            <span
                                className={`inline-block mt-3 px-4 py-1 rounded-full text-xs font-bold border
                  ${teacher.status === "Active"
                                        ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
                                        : "bg-orange-400/10 text-orange-400 border-orange-400/20"
                                    }`}
                            >
                                {teacher.status}
                            </span>
                        </div>
                    </div>

                    {/* Professional Info */}
                    <div>
                        <h4 className="text-gray-400 font-semibold mb-4">
                            Professional Information
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <InfoCard label="Subject" value={teacher.subject} />

                            <InfoCard label="Assigned Classes" value={assignedClasses} />

                            <InfoCard label="Qualification" value={details?.qualification || "-"} />

                            <InfoCard label="Experience" value={details?.experience || "-"} />

                            {/* Full width Joining Date */}
                            <div className="md:col-span-2">
                                <InfoCard label="Joining Date" value={joiningDate} />
                            </div>

                        </div>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h4 className="text-gray-400 font-semibold mb-4">
                            Contact Information
                        </h4>

                        <div className="rounded-2xl border border-lime-400/20 bg-lime-400/5 p-6 space-y-4">

                            <div>
                                <p className="text-lime-400 text-sm">Email</p>
                                <p className="text-white font-semibold">
                                    {details?.email || "-"}
                                </p>
                            </div>

                            <div>
                                <p className="text-lime-400 text-sm">Phone</p>
                                <p className="text-white">
                                    {teacher.phone}
                                </p>
                            </div>

                            <div>
                                <p className="text-lime-400 text-sm">Address</p>
                                <p className="text-white">
                                    {details?.address || "-"}
                                </p>
                            </div>

                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-white/10 flex justify-between gap-4 bg-[#0F172A]">

                    <button
                        onClick={onClose}
                        className="w-1/2 px-6 py-3 rounded-2xl bg-white/5 text-gray-300 hover:bg-white/10 transition"
                    >
                        Close
                    </button>

                    <button
                        onClick={() => {
                            onClose();      // close show modal
                            onEdit(teacher); // open edit modal
                        }}
                        className="w-1/2 px-6 py-3 rounded-2xl bg-lime-400 text-black font-semibold hover:bg-lime-300 transition flex items-center justify-center gap-2 shadow-lg shadow-lime-400/30"
                    >
                        <Pencil size={16} />
                        Edit Teacher
                    </button>

                </div>

            </div>
        </div>
    );
};

export default ShowTeacher;

/* Reusable Info Card */
const InfoCard = ({
    label,
    value,
}: {
    label: string;
    value: string;
}) => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white font-semibold mt-2">{value}</p>
    </div>
);
