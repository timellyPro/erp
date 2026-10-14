"use client";

import { Shield } from "lucide-react";
import clsx from "clsx";

interface RoleSelectorProps {
  value: "SCHOOLADMIN" | "TEACHER" | "STUDENT";
  onChange: (role: "SCHOOLADMIN" | "TEACHER" | "STUDENT") => void;
}

const ROLES = [
  { value: "TEACHER", label: "Teacher" },
  // { value: "SCHOOLADMIN", label: "Admin" },
  // { value: "STUDENT", label: "Student" },
] as const;

export default function RoleSelector({
  value,
  onChange,
}: RoleSelectorProps) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-white mb-3">
        User Role
      </label>

      <div
        className="
          grid grid-cols-3 gap-4
        "
      >
        {ROLES.map((role) => {
          const isActive = value === role.value;

          return (
            <label
              key={role.value}
              className={clsx(
                "py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all bg-black/20 border-white/10 text-gray-400 hover:border-white/30",
                isActive
                  ? "border-lime-400 text-lime-400  shadow-lg shadow-lime-400/10"
                  : "border-white/10 text-white/70 bg-white/5 hover:bg-white/10"
              )}
            >
              <input
                type="radio"
                name="role"
                value={role.value}
                checked={true} //{isActive} Always checked to allow deselection by clicking another option
                onChange={() => onChange(role.value)}
                className="hidden"
              />

              <Shield
                size={16}
                className={clsx(
                  "transition-colors",
                  isActive ? "text-lime-400" : "text-white/40"
                )}
              />

              {role.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
