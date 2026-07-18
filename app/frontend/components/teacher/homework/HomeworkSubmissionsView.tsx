"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, User } from "lucide-react";
import AttachmentPreview from "../../common/AttachmentPreview";
import TimellyLoader from "../../common/TimellyLoader";

export type SubmissionRow = {
  id: string;
  content: string | null;
  fileUrl: string | null;
  submittedAt: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  rollNo: string | null;
};

type HomeworkSubmissionsViewProps = {
  homeworkId: string;
  onBack: () => void;
};


export default function HomeworkSubmissionsView({ homeworkId, onBack }: HomeworkSubmissionsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeworkTitle, setHomeworkTitle] = useState<string>("");
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/homework/${homeworkId}/submissions`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to load submissions");
        setSubmissions([]);
        return;
      }
      
      setHomeworkTitle(data.homework?.title ?? "Submissions");
      setSubmissions(data.submissions ?? []);
    } catch {
      setError("Something went wrong");
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  if (loading) {
    return (
      <TimellyLoader
        compact
        title="Loading submissions"
        steps={["Students", "Files", "Ready"]}
      />
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm"
        >
          <ArrowLeft size={18} /> Back to Homework
        </button>
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-white/70 hover:text-white text-sm w-fit"
        >
          <ArrowLeft size={18} /> Back to Homework
        </button>
        <h3 className="text-lg font-semibold text-white truncate">
          {homeworkTitle}
        </h3>
      </div>

      <p className="text-white/60 text-sm">
        {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
      </p>

      {submissions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
          No submissions yet.
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6 flex flex-col md:flex-row md:items-start gap-4"
            >
              <div className="flex items-center gap-3 min-w-0 md:min-w-[200px]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-400/20 text-lime-400">
                  <User size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{s.studentName}</p>
                  <p className="text-xs text-white/50">
                    {s.admissionNumber}
                    {s.rollNo ? ` • Roll: ${s.rollNo}` : ""}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Submitted {new Date(s.submittedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                {s.content && (
                  <p className="text-sm text-white/70 whitespace-pre-wrap">{s.content}</p>
                )}
                {s.fileUrl ? (
                  <div>
                    <p className="text-xs text-white/50 mb-1 uppercase tracking-wide">Document</p>
                    <AttachmentPreview
                      url={s.fileUrl}
                      label="View submission document"
                      className="w-full max-w-md"
                    />
                  </div>
                ) : (
                  !s.content && (
                    <p className="text-sm text-white/40 italic">No attachment or text</p>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
