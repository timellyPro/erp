"use client";

import { BriefcaseBusiness, Clock3, Hash, User } from "lucide-react";
import type { ComponentType } from "react";
import { TeacherProfileData } from "../types";

interface TeacherHeroCardProps {
  profile: TeacherProfileData;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export default function TeacherHeroCard({ profile }: TeacherHeroCardProps) {
  const hasPhoto = Boolean(profile.avatarUrl?.trim());

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 sm:p-6">
      <div className="flex flex-col items-center gap-5 text-center sm:items-start sm:text-left lg:flex-row lg:items-center">
        <div className="relative">
          <div className="h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32 overflow-hidden rounded-3xl border-4 border-[#29203f] bg-white/10 flex items-center justify-center">
            {hasPhoto ? (
              <img
                src={profile.avatarUrl!}
                alt={profile.name || "Teacher"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl sm:text-3xl font-bold text-lime-400/90 tracking-wide">
                {profile.name ? initialsFromName(profile.name) : <User size={36} className="text-white/40" />}
              </span>
            )}
          </div>
          <div className="absolute -bottom-2 -right-2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-lime-400 text-black shadow-lg">
            <BriefcaseBusiness size={16} className="sm:hidden" />
            <BriefcaseBusiness size={18} className="hidden sm:block" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-[20px] sm:text-[22px] lg:text-[24px] font-bold leading-tight text-white">
            {profile.name || "Teacher"}
          </h2>
          <p className="text-[14px] font-semibold leading-tight text-lime-400">
            {profile.subject ? `${profile.subject} Teacher` : "Teacher"}
          </p>
          <div className="flex flex-wrap justify-center sm:justify-start gap-2.5 sm:gap-3">
            {profile.teacherId ? <Chip icon={Hash} text={profile.teacherId} /> : null}
            {profile.joiningDate ? <Chip icon={Clock3} text={`Joined ${profile.joiningDate}`} /> : null}
            {profile.experience ? (
              <Chip icon={BriefcaseBusiness} text={`${profile.experience} Exp.`} />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  text: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2">
      <Icon size={16} className="text-white/60" />
      <span className="text-[13px] sm:text-[14px] text-white/80">{text}</span>
    </div>
  );
}
