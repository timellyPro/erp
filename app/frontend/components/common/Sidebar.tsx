"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, User, ChevronRight } from "lucide-react";
import { SidebarItem } from "../../types/sidebar";
import BrandLogo from "./TimellyLogo";
import { PRIMARY_COLOR } from "../../constants/colors";
import { AVATAR_URL } from "../../constants/images";
import { useMemo } from "react";
import { addRecentLogin, getRecentLogins } from "../../utils/recentLogins";

const LOGIN_URL = "/admin/login";

type Props = {
  menuItems: SidebarItem[];
  profile?: {
    name: string;
    subtitle?: string;
    image?: string | null;
    email?: string;
  };
  activeTab?: string;
  onLogoutRequest?: () => void;
  enableSwitchAccounts?: boolean;
};

export default function AppSidebar({ menuItems, profile, activeTab = "dashboard", onLogoutRequest, enableSwitchAccounts }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const [accounts, setAccounts] = useState<{ email: string; name: string; userId: string }[]>([]);
  const [liveProfile, setLiveProfile] = useState<{
    name: string;
    subtitle: string;
    image: string;
    email: string;
  } | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const currentEmail = (session?.user as { email?: string })?.email ?? profile?.email;
  const baseProfile = useMemo(
    () => ({
      name:
        profile?.name && profile.name.trim()
          ? profile.name
          : session?.user?.name ?? "User",
      subtitle: profile?.subtitle ?? session?.user?.role ?? "",
      image:
        profile?.image != null && profile.image !== ""
          ? profile.image
          : session?.user?.image ?? AVATAR_URL,
      email: profile?.email ?? session?.user?.email ?? "",
    }),
    [
      profile?.email,
      profile?.image,
      profile?.name,
      profile?.subtitle,
      session?.user?.email,
      session?.user?.image,
      session?.user?.name,
      session?.user?.role,
    ]
  );

  // Save current user to recent logins when in student portal
  useEffect(() => {
    if (enableSwitchAccounts && session?.user) {
      const u = session.user as { email?: string; name?: string; id?: string };
      const email = u.email || profile?.email;
      if (email && u.id) {
        addRecentLogin({
          email,
          name: u.name || profile?.name || "User",
          userId: u.id,
        });
      }
    }
  }, [enableSwitchAccounts, session?.user, profile?.email, profile?.name]);

  useEffect(() => {
    if (profileOpen && enableSwitchAccounts) {
      setAccounts(getRecentLogins());
    }
  }, [profileOpen, enableSwitchAccounts]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwitchAccount = (account: { email: string }) => {
    if (account.email === currentEmail) return;
    setProfileOpen(false);
    const url = `${LOGIN_URL}?email=${encodeURIComponent(account.email)}`;
    signOut({ redirect: false }).then(() => {
      window.location.href = url;
    });
  };

  useEffect(() => {
    setLiveProfile((prev) => ({
      ...baseProfile,
      ...prev,
      name: prev?.name?.trim() ? prev.name : baseProfile.name,
      subtitle: prev?.subtitle || baseProfile.subtitle,
      image: prev?.image != null && prev.image !== "" ? prev.image : baseProfile.image,
      email: prev?.email || baseProfile.email,
    }));
  }, [baseProfile]);

  useEffect(() => {
    const onUpdated = (event?: Event) => {
      const detail =
        event && "detail" in event
          ? (event as CustomEvent<{ photoUrl?: string | null; name?: string; email?: string }>).detail
          : undefined;
      setLiveProfile((prev) => ({
        name: detail?.name ?? prev?.name ?? baseProfile.name,
        subtitle: prev?.subtitle ?? baseProfile.subtitle,
        image:
          detail?.photoUrl !== undefined
            ? detail.photoUrl || baseProfile.image
            : prev?.image ?? baseProfile.image,
        email: detail?.email ?? prev?.email ?? baseProfile.email,
      }));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "timelly:profile-updated") {
        setLiveProfile((prev) => ({
          name: prev?.name ?? baseProfile.name,
          subtitle: prev?.subtitle ?? baseProfile.subtitle,
          image: prev?.image ?? baseProfile.image,
          email: prev?.email ?? baseProfile.email,
        }));
      }
    };
    window.addEventListener("teacher-profile-updated", onUpdated);
    window.addEventListener("profile-updated", onUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("teacher-profile-updated", onUpdated);
      window.removeEventListener("profile-updated", onUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [baseProfile]);

  const displayName = (liveProfile?.name && liveProfile.name.trim())
    ? liveProfile.name
    : baseProfile.name;
  const subtitle = liveProfile?.subtitle ?? baseProfile.subtitle;
  const avatarUrlRaw = (liveProfile?.image != null && liveProfile.image !== "")
    ? liveProfile.image
    : baseProfile.image;
  const avatarUrl =
    typeof avatarUrlRaw === "string" &&
    avatarUrlRaw.includes("/storage/v1/object/")
      ? `/api/media?url=${encodeURIComponent(avatarUrlRaw)}`
      : avatarUrlRaw;

  // Only filter menu items for TEACHER role. Other roles see full menu.
  const allowedFeatures = (session?.user as any)?.allowedFeatures ?? [];
  const isTeacher = session?.user?.role === "TEACHER";
  const isStudent = session?.user?.role === "STUDENT";

  const handleClick = async (item: SidebarItem) => {
    if (item.disabled) {
      return;
    }
    if (item.action === "logout") {
      if (onLogoutRequest) {
        onLogoutRequest();
        return;
      }
      await signOut({ callbackUrl: "/" });
      return;
    }
    if (item.href) {
      router.push(item.href);
      return;
    }
    if (item.tab && pathname) {
      router.push(`${pathname}?tab=${encodeURIComponent(item.tab)}`);
    }
  };

  const isAllowed = (item: SidebarItem) => {
    if (!isTeacher) return true;
    if (!item.tab && !item.permission) return true;
    if (!allowedFeatures || allowedFeatures.length === 0) return true;
    if (item.tab && allowedFeatures.includes(item.tab)) return true;
    if (item.permission && allowedFeatures.includes(String(item.permission))) return true;
    return false;
  };

  const { mainItems, bottomItems } = useMemo(() => {
    const allowed = menuItems.filter(isAllowed);
    const bottom = allowed.filter(
      (item) => item.action === "logout" || item.tab === "settings"
    );
    const main = allowed.filter(
      (item) => item.action !== "logout" && item.tab !== "settings"
    );
    return { mainItems: main, bottomItems: bottom };
  }, [menuItems, isTeacher, allowedFeatures]);

  return (
    <aside
      className="
        hidden lg:flex
        w-64 shrink-0 h-full flex-col
        bg-white/10 backdrop-blur-2xl
        border-r border-white/10
        shadow-[2px_0_12px_rgba(0,0,0,0.2)]
      "
    >
      {/* Logo */}
      <div className="h-21 flex items-center px-4 border-b border-white/10">
        <BrandLogo isbrandLogoWhite />
      </div>

      {/* Profile */}
      <div className="px-4 py-4 border-b border-white/10" ref={profileRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => enableSwitchAccounts && setProfileOpen((o) => !o)}
            className={`w-full bg-white/5 rounded-xl p-3 border border-white/10 text-left transition-all ${enableSwitchAccounts ? "hover:bg-white/10 cursor-pointer" : "cursor-default"}`}
          >
            <div className="flex items-center gap-3">
              <img
                src={avatarUrl}
                alt=""
                className="w-10 h-10 rounded-xl border border-white/20 object-cover shrink-0"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = AVATAR_URL;
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white break-words line-clamp-2">
                  {displayName}
                </p>
                <p className="text-xs text-white/60 break-words line-clamp-2">{subtitle}</p>
              </div>
              {enableSwitchAccounts && (
                <ChevronDown
                  size={18}
                  className={`text-white/50 shrink-0 transition-transform ${profileOpen ? "rotate-180" : ""}`}
                />
              )}
            </div>
          </button>

          {enableSwitchAccounts && profileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute left-0 right-0 mt-2 bg-[#0F172A] rounded-xl border border-white/10 shadow-xl py-2 z-20 max-h-[280px] overflow-y-auto"
            >
              {accounts.length === 0 ? (
                <p className="px-4 py-3 text-xs text-white/50">No other accounts</p>
              ) : (
                accounts.map((account) => {
                  const isCurrent = account.email === currentEmail;
                  return (
                    <button
                      type="button"
                      key={account.email}
                      onClick={() => handleSwitchAccount(account)}
                      disabled={isCurrent}
                      className={`
                        w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all
                        ${isCurrent
                          ? "opacity-70 cursor-default"
                          : "hover:bg-white/10"
                        }
                      `}
                    >
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                        <User size={16} className="text-white/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {account.name || account.email}
                        </p>
                        <p className="text-[11px] text-white/50 truncate">{account.email}</p>
                      </div>
                      {!isCurrent && (
                        <ChevronRight size={16} className="text-white/40 shrink-0" />
                      )}
                      {isCurrent && (
                        <span className="text-[10px] text-lime-400 font-medium shrink-0">
                          Current
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto no-scrollbar">
          {mainItems.map((item) => {
            const isActive = item.tab === activeTab;
            const Icon = item.icon;

            return (
              <motion.button
                type="button"
                key={item.label}
                whileHover={{ x: 4 }}
                onClick={() => handleClick(item)}
                className={`
                  w-full flex items-center gap-4 px-5 py-3 rounded-xl
                  transition min-w-0
                  ${
                    isActive
                      ? "bg-lime-400/10 text-lime-400 border border-lime-400/20 shadow-[0_0_22px_rgba(163,230,53,0.18)]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <Icon
                  size={20}
                  className="flex-shrink-0"
                  style={{ color: isActive ? PRIMARY_COLOR : "#9ca3af" }}
                />
                <div className="min-w-0 text-left">
                  <span className="block truncate text-sm ">{item.label}</span>
                  {item.description && (
                    <span className="block truncate text-xs text-white/55">{item.description}</span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {bottomItems.length > 0 && (
          <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/10">
            {bottomItems.map((item) => {
              const isActive = item.tab === activeTab;
              const isLogout = item.action === "logout";
              const Icon = item.icon;
              return (
                <motion.button
                  type="button"
                  key={item.label}
                  whileHover={{ x: 4 }}
                  onClick={() => handleClick(item)}
                  className={`
                    w-full flex items-center gap-4 px-5 py-3 rounded-xl
                    transition min-w-0
                    ${
                      isLogout
                        ? "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        : isActive
                        ? "bg-lime-400/10 text-lime-400 border border-lime-400/20"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }
                  `}
                >
                  <Icon
                    size={20}
                    className="flex-shrink-0"
                    style={{
                      color: isLogout ? "#f87171" : isActive ? PRIMARY_COLOR : "#9ca3af",
                    }}
                  />
                  <span className="truncate text-sm">{item.label}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

    </aside>
  );
}
