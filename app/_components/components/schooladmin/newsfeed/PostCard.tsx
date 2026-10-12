"use client";

import { useState } from "react";
import { Heart, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { formatRelativeTime } from "../../../utils/format";
import { downloadImageFromUrl } from "../../../utils/downloadImage";
import type { NewsFeedItem } from "../../../hooks/useNewsFeeds";

interface PostCardProps {
  post: NewsFeedItem;
  onLike: (id: string) => void;
  isLiking?: boolean;
}

export default function PostCard({ post, onLike, isLiking = false }: PostCardProps) {
  const photoUrl = post.createdBy?.photoUrl ?? "https://ui-avatars.com/api/?name=School&background=random&color=fff&size=128";
  const authorName = post.createdBy?.name ?? "School";
  const timeStr = formatRelativeTime(post.createdAt);

  const images = (post.photos && post.photos.length > 0) ? post.photos : (post.photo ? [post.photo] : []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const hasMultiple = images.length > 1;

  const handleDownloadImage = async (idx: number) => {
    const url = images[idx];
    if (!url) return;
    setDownloadingIndex(idx);
    try {
      await downloadImageFromUrl(url, `newsfeed-${post.id}-${idx + 1}`);
    } finally {
      setDownloadingIndex(null);
    }
  };

  const goPrev = () => setCurrentIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
  const goNext = () => setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));

  return (
    <article className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl md:rounded-3xl overflow-hidden">
      {/* Header: avatar + name + time, Published pill */}
      <div className="p-3 sm:p-4 flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/20 flex-shrink-0 overflow-hidden ring-2 ring-white/10">
            <div className="w-full h-full flex items-center justify-center text-white/90 text-sm font-semibold">
              <img src={photoUrl} alt={authorName} className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm sm:text-base leading-tight truncate text-white">{authorName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{timeStr}</p>
          </div>
        </div>
        <span className="bg-[#82922c]/30 text-[#d4ff00] text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded-full border border-[#d4ff00]/20 font-medium shrink-0">
          Published
        </span>
      </div>

      {images.length > 0 && (
        <div className="relative w-full bg-black/20 group">
          <button
            type="button"
            onClick={() => handleDownloadImage(currentIndex)}
            disabled={downloadingIndex === currentIndex}
            className="absolute right-2 top-2 z-10 w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition opacity-90 hover:opacity-100 disabled:opacity-50"
            aria-label="Download image"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
          <img
            src={images[currentIndex]}
            alt=""
            className="w-full h-auto block"
          />
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition opacity-80 group-hover:opacity-100"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition opacity-80 group-hover:opacity-100"
                aria-label="Next photo"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition ${
                      i === currentIndex ? "bg-white" : "bg-white/50"
                    }`}
                    aria-hidden
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="p-4 sm:p-5 md:p-6 bg-[#2d1b2d]/90 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => onLike(post.id)}
          disabled={isLiking}
          className="mb-3 flex items-center gap-2 text-gray-300 transition hover:text-red-400 touch-manipulation disabled:cursor-not-allowed disabled:opacity-70 sm:mb-4"
        >
          <Heart
            className={`w-4 h-4 sm:w-5 sm:h-5 transition ${post.likedByMe ? "fill-red-500 text-red-500" : ""}`}
          />
          <span className="text-xs sm:text-sm font-medium">{post.likes}</span>
        </button>

        <h4 className="text-base sm:text-lg font-bold mb-2 text-white leading-tight">{post.title}</h4>
        <p className="text-gray-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
          {post.description}
        </p>
      </div>
    </article>
  );
}
