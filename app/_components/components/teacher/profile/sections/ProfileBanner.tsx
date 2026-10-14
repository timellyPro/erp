"use client";

import { ChevronUp, SquarePen } from "lucide-react";
import PageHeader from "../../../common/PageHeader";

interface ProfileBannerProps {
  isEditMode: boolean;
  onToggleEdit: () => void;
}

export default function ProfileBanner({ isEditMode, onToggleEdit }: ProfileBannerProps) {
  return (
    <PageHeader
      title="Teacher Profile"
      subtitle="View and manage your professional profile"
      className="mb-0 bg-white/5 backdrop-blur-xl border border-white/10"
      rightSlot={
        <button
          type="button"
          onClick={onToggleEdit}
          className={
            isEditMode
              ? "w-full md:w-auto px-5 sm:px-6 py-2.5 rounded-xl font-medium transition-all shadow-sm flex items-center gap-2 justify-center md:justify-start bg-white/10 hover:bg-white/20 text-white border border-white/10"
              : "w-full md:w-auto px-5 sm:px-6 py-2.5 rounded-xl font-medium transition-all shadow-sm flex items-center gap-2 justify-center md:justify-start bg-lime-400 hover:bg-lime-500 text-black shadow-[0_0_20px_rgba(163,230,53,0.3)] hover:shadow-[0_0_25px_rgba(163,230,53,0.5)]"
          }
        >
          {isEditMode ? <ChevronUp size={18} /> : <SquarePen size={18} />}
          {isEditMode ? "Cancel Editing" : "Edit Profile"}
        </button>
      }
    />
  );
}
