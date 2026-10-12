"use client";

import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
function isImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return IMAGE_EXT.some((ext) => path.endsWith(ext));
  } catch {
    return false;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").pop() || "attachment";
    return decodeURIComponent(name);
  } catch {
    return "attachment";
  }
}

type AttachmentPreviewProps = {
  url: string;
  label?: string;
  className?: string;
};

export default function AttachmentPreview({ url, label, className = "" }: AttachmentPreviewProps) {
  const name = fileNameFromUrl(url);
  const isImage = isImageUrl(url);
  const [imgError, setImgError] = useState(false);
  const showThumb = isImage && !imgError;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition-colors group ${className}`}
    >
      {showThumb ? (
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/20">
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        </span>
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/60 group-hover:text-lime-400 transition-colors">
          <FileText size={22} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white/90 truncate" title={name}>
          {label ?? name}
        </span>
        <span className="flex items-center gap-1 text-xs text-white/50 group-hover:text-lime-400/80 transition-colors">
          <ExternalLink size={12} /> Open
        </span>
      </span>
    </a>
  );
}
