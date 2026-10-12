"use client";

import { Mail, MapPin, PhoneCall } from "lucide-react";
import type { ComponentType } from "react";
import { TeacherProfileData } from "../types";

interface ContactInformationCardProps {
  profile: TeacherProfileData;
}

export default function ContactInformationCard({ profile }: ContactInformationCardProps) {
  return (
    <section className="min-h-[200px] overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="flex items-center gap-3 p-5 sm:px-6">
        <PhoneCall size={20} className="text-lime-400" />
        <h3 className="text-xl font-bold text-white">Contact Information</h3>
      </div>
      <div className="h-px bg-white/10" />

      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6 sm:py-5">
        <ContactItem label="Email Address" value={profile.email} icon={Mail} className="sm:col-span-2" />
        <ContactItem label="Phone Number" value={profile.phone} icon={PhoneCall} />
        <ContactItem label="Location" value={profile.address} icon={MapPin} />
      </div>
    </section>
  );
}


function ContactItem({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-white/35">{label}</p>
      <div className="mt-3 flex items-start sm:items-center gap-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white/60">
          <Icon size={16} />
        </span>
        <p className="text-[13px] sm:text-[14px] font-semibold text-white break-words">
          {value?.trim() ? value : "—"}
        </p>
      </div>
    </div>
  );
}
