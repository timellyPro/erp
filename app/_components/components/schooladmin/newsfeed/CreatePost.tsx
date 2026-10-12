"use client";

import { useState, useCallback } from "react";
import { Image as ImageIcon, Send, X, Loader2 } from "lucide-react";
import { createNewsfeedPost } from "@/lib/api/newsfeed";
import { uploadImage } from "../../../utils/upload";

function getClipboardImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData?.items?.length) return null;
  const item = Array.from(clipboardData.items).find((i) => i.type.startsWith("image/"));
  if (!item) return null;
  return item.getAsFile();
}

interface CreatePostProps {
  onPublished: () => void;
}

export default function CreatePost({ onPublished }: CreatePostProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    setPhotoUploading(true);
    setError("");
    try {
      const urls: string[] = [];
      for (const file of imageFiles) {
        urls.push(await uploadImage(file, "newsfeed"));
      }
      setPhotoUrls((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setPhotoUploading(false);
    }
    e.target.value = "";
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const file = getClipboardImageFile(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    setPhotoUploading(true);
    setError("");
    try {
      const url = await uploadImage(file, "newsfeed");
      setPhotoUrls((prev) => [...prev, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setPhotoUploading(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required");
      return;
    }
    setPosting(true);
    try {
      const { ok, data } = await createNewsfeedPost({
        title: title.trim(),
        description: description.trim(),
        photo: photoUrls[0] || undefined,
        photos: photoUrls,
        mediaUrl: photoUrls[0] || undefined,
      });
      if (!ok) throw new Error(data.message || "Failed to create post");
      setTitle("");
      setDescription("");
      setPhotoUrls([]);
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create post");
    } finally {
      setPosting(false);
    }
  };

  return (
    <section
      className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 sm:p-5 md:p-6"
      onPaste={handlePaste}
    >
      <h3 className="text-base md:text-lg font-medium mb-3 md:mb-4">Create New Post</h3>
      <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
        <input
          type="text"
          placeholder="Post title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 md:py-3 text-sm md:text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-1 ring-white/30"
        />
        <textarea
          placeholder="What would you like to share..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm md:text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-1 ring-white/30 resize-none"
        />

        {/* Photo: file picker or paste image → upload to Supabase */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-gray-300 hover:text-white transition text-xs md:text-sm cursor-pointer">
            {photoUploading ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <ImageIcon className="w-4 h-4 md:w-5 md:h-5" />}
            <span>{photoUploading ? "Uploading…" : "Add photos (multiple)"}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              disabled={photoUploading}
            />
          </label>
          <span className="text-white/50 text-xs">or paste image (Ctrl+V)</span>
        </div>
        {photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photoUrls.map((url, i) => (
              <div key={url} className="relative inline-block">
                <img src={url} alt={`Attached ${i + 1}`} className="max-h-40 rounded-xl border border-white/10 object-cover" />
                <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={posting}
            className="w-full sm:w-auto bg-[#b4f42c] text-black px-4 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs md:text-sm flex items-center justify-center gap-2 hover:bg-[#a3e028] transition disabled:opacity-60 shrink-0"
          >
            <Send className="w-3.5 h-3.5 md:w-4 md:h-4" /> {posting ? "Publishing..." : "Publish"}
          </button>
        </div>
      </form>
    </section>
  );
}
