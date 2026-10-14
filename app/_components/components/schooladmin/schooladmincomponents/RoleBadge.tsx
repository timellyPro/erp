"use client";

interface RoleBadgeProps {
  role: string;
}

const ROLE_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  SCHOOLADMIN: {
    label: "Admin",
    bg: "bg-purple-400/10",
    text: "text-purple-400",
    border: "border-purple-400/30",
  },

  TEACHER: {
    label: "Teacher",
    bg: "bg-indigo-500/15",
    text: "text-indigo-400",
    border: "border-indigo-400/40",
  },

  STUDENT: {
    label: "Student",
    bg: "bg-emerald-400/15",
    text: "text-emerald-400",
    border: "border-emerald-400/40",
  },

  PARENT: {
    label: "Parent",
    bg: "bg-orange-400/15",
    text: "text-orange-400",
    border: "border-orange-400/40",
  },
};

export default function RoleBadge({ role }: RoleBadgeProps) {
  const config =
    ROLE_CONFIG[role] || {
      label: role,
      bg: "bg-white/10",
      text: "text-white/80",
      border: "border-white/20",
    };

  return (
    <span
      className={`
        inline-flex items-center
        px-3 py-1
        rounded-full
        text-xs font-medium
        border
        ${config.bg}
        ${config.text}
        ${config.border}
      `}
    >
      {config.label}
    </span>
  );
}
