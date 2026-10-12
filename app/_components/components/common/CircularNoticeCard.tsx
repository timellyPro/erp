"use client";

import { Calendar, Download, FileText } from "lucide-react";

type CircularNoticeCardProps = {
  referenceNumber: string;
  subject: string;
  content: string;
  publishStatus: string;
  date: string;
  issuedBy?: string | null;
  issuedByPhoto?: string | null;
  attachments?: string[];
  accentClassName?: string;
  className?: string;
};

function getInitials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "S";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function fileLabel(path: string) {
  const parts = path.split("/");
  return parts[parts.length - 1] || "Attachment";
}

export default function CircularNoticeCard({
  referenceNumber,
  subject,
  content,
  publishStatus,
  date,
  issuedBy,
  issuedByPhoto,
  attachments = [],
  accentClassName = "bg-lime-400",
  className = "",
}: CircularNoticeCardProps) {
  const issuer = issuedBy?.trim() || "School Admin";
  const isPublished = publishStatus.toUpperCase() === "PUBLISHED";

  return (
    <article
      className={`relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur-xl flex flex-col ${className}`}
    >
      <div className={`absolute top-0 left-0 h-1 w-full ${accentClassName}`} />

      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{referenceNumber || "CIR/NA"}</span>
        <span
          className={`px-2 py-1 rounded-full font-semibold border ${
            isPublished
              ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
              : "bg-white/10 text-white/70 border-white/20"
          }`}
        >
          {publishStatus || "DRAFT"}
        </span>
      </div>

      <h4 className="mt-3 sm:mt-4 text-lg sm:text-2xl font-bold text-white leading-tight line-clamp-2">{subject}</h4>

      <div className="mt-3 sm:mt-4 bg-black/20 rounded-lg sm:rounded-xl p-3 sm:p-5 border border-white/5 flex-1">
        <p className="text-sm sm:text-base text-white/60 italic leading-relaxed line-clamp-4 sm:line-clamp-6">{content}</p>
      </div>

      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          {attachments.slice(0, 2).map((file) => (
            /^https?:\/\//i.test(file) ? (
              <a
                key={file}
                href={file}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm text-white/80 truncate">
                  <FileText className="h-4 w-4 text-lime-400 shrink-0" />
                  <span className="truncate">{fileLabel(file)}</span>
                </span>
                <Download className="h-4 w-4 text-white/50 shrink-0" />
              </a>
            ) : (
              <div
                key={file}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
              >
                <span className="flex items-center gap-2 text-sm text-white/80 truncate">
                  <FileText className="h-4 w-4 text-lime-400 shrink-0" />
                  <span className="truncate">{fileLabel(file)}</span>
                </span>
              </div>
            )
          ))}
        </div>
      )}

      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between text-xs sm:text-sm text-white/60 gap-2">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-full bg-lime-400/20 text-lime-300 flex items-center justify-center text-xs font-bold overflow-hidden">
            {issuedByPhoto ? (
               
              <img src={issuedByPhoto} alt={issuer} className="h-full w-full object-cover" />
            ) : (
              getInitials(issuer)
            )}
          </span>
          <span className="truncate max-w-[140px]">{issuer}</span>
        </div>
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          {new Date(date).toLocaleDateString("en-GB")}
        </span>
      </div>
    </article>
  );
}
