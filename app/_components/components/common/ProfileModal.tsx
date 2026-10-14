"use client";

import { useEffect } from "react";
import { X, Mail, User, Settings, Phone, MapPin } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { AVATAR_URL } from "../../constants/images";

type ProfileModalProfile = {
  name: string;
  email?: string;
  image?: string | null;
  role?: string;
  phone?: string;
  userId?: string;
  address?: string;
  status?: string;
};

export default function ProfileModal({
  onClose,
  onOpenSettings,
  profile: profileProp,
}: {
  onClose: () => void;
  onOpenSettings?: () => void;
  profile?: ProfileModalProfile;
}) {
  const { data: session } = useSession();
  const name = profileProp?.name ?? session?.user?.name ?? "User";
  const email = profileProp?.email ?? session?.user?.email ?? "";
  const role = profileProp?.role ?? session?.user?.role ?? "";
  const normalizedRole = role.replace(/\s+/g, "_").toUpperCase();
  const isSuperAdmin = normalizedRole === "SUPER_ADMIN" || normalizedRole === "SUPERADMIN";
  const phone = profileProp?.phone ?? session?.user?.mobile ?? "";
  const address = profileProp?.address ?? "";
  const _status = profileProp?.status ?? "ACTIVE";
  const imageUrl = profileProp?.image ?? session?.user?.image ?? AVATAR_URL;
  const roleLabel = formatRole(role);

  const _handleLogout = async () => {
    onClose();
    await signOut({ callbackUrl: "/" });
  };

  const handleSettings = () => {
    onClose();
    onOpenSettings?.();
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="
        fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] animate-fadeIn
      "
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[rgba(255,255,255,0.05)] backdrop-blur-xl border
         border-[rgba(255,255,255,0.1)] border-solid rounded-2xl 
         shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)] 
         max-w-md w-full mx-4 animate-scaleIn overflow-hidden p-6 relative"
        
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 hover:bg-white/[0.1] rounded-lg transition-all text-white/65 hover:text-white z-10"
          aria-label="Close profile modal"
        >
          <X className="text-white" size={20} />
        </button>

        <div className="flex gap-4 items-center mb-6 relative pb-6 border-b border-white/[0.1] bg-white/[0.02] -mx-6 -mt-6 px-6 pt-6">
          <img
            src={imageUrl}
            alt={name}
            className="w-16 h-16 rounded-2xl border-2 border-white/[0.1] object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = AVATAR_URL;
            }}
          />
          <div>
            <h2 id="profile-modal-title" className="text-xl font-bold text-white">{name}</h2>
            <p className="text-[#C7F000] text-sm font-medium">{roleLabel || "-"}</p>
          </div>
        </div>

        <div className="space-y-4">
          <Info icon={<Mail className="lucide lucide-mail w-5 h-5 text-[#C7F000]"/>} label="Email" value={email || "-"} />
          <Info icon={<Phone className="lucide lucide-mail w-5 h-5 text-[#C7F000]"/>} label="Phone" value={phone || "-"} />
          <Info icon={<MapPin className="lucide lucide-mail w-5 h-5 text-[#C7F000]"/>} label="Address" value={address || "-"} />
          <Info icon={<User className="lucide lucide-mail w-5 h-5 text-[#C7F000]"/>} label="Role" value={roleLabel || "-"} />
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={handleSettings}
              className="w-full py-3.5 bg-[#C7F000]/22 hover:bg-[#C7F000]/30 text-[#0F172A] border
             border-[#C7F000]/30 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 
            shadow-[0_0_22px_rgba(199,240,0,0.45)]"
            >
              <Settings size={18} /> Settings
            </button>
          )}
          {/* <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 rounded-xl bg-white/10 text-white font-medium flex items-center justify-center gap-2 hover:bg-white/15"
          >
            <LogOut size={18} /> Sign Out
          </button> */}
        </div>
      </div>
    </div>
  );
}

function formatRole(role: string): string {
  if (!role) return "";
  if (role.includes(" ")) return role;
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.08] transition-all">
      <div className="p-2.5 bg-[#C7F000]/18 rounded-xl border border-[#C7F000]/25">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white/60 font-medium uppercase tracking-wider">{label}</p>
        <p className="font-medium text-white/78 text-sm mt-0.5">{value}</p>
      </div>
    </div>
  );
}
