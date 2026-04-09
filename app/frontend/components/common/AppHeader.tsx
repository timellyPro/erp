"use client";

import { Bell, Search, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import SectionHeader from "./SectionHeader";
import SearchInput from "./SearchInput";
import NotificationPanel from "./NotificationPanel";
import ProfileModal from "./ProfileModal";
import { AVATAR_URL } from "../../constants/images";

export type HeaderProfile = {
  name: string;
  subtitle?: string;
  image?: string | null;
  email?: string;
  phone?: string;
  userId?: string;
  address?: string;
  status?: string;
};

interface AppHeaderProps {
  title: string;
  profile?: HeaderProfile;
  /** When true, do not show search and notification icons (e.g. Super Admin) */
  hideSearchAndNotifications?: boolean;
}

export default function AppHeader({ title, profile, hideSearchAndNotifications = false }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalProfile, setModalProfile] = useState<HeaderProfile | undefined>(profile);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveProfile, setLiveProfile] = useState<HeaderProfile | null>(null);

  const { data: session } = useSession();
  const isSuperAdminPanel = pathname?.startsWith("/frontend/pages/superadmin");
  const baseProfile = useMemo(
    () => ({
      name: profile?.name?.trim() ? profile.name : session?.user?.name ?? "User",
      subtitle: profile?.subtitle ?? session?.user?.role ?? "",
      image:
        profile?.image != null && profile.image !== ""
          ? profile.image
          : session?.user?.image ?? AVATAR_URL,
      email: profile?.email ?? session?.user?.email ?? "",
      phone: profile?.phone ?? session?.user?.mobile ?? "",
      userId: profile?.userId,
      address: profile?.address,
      status: profile?.status,
    }),
    [
      profile?.address,
      profile?.email,
      profile?.image,
      profile?.name,
      profile?.phone,
      profile?.status,
      profile?.subtitle,
      profile?.userId,
      session?.user?.email,
      session?.user?.image,
      session?.user?.mobile,
      session?.user?.name,
      session?.user?.role,
    ]
  );

  const unreadAbortRef = useRef<AbortController | null>(null);
  const unreadInFlightRef = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    if (hideSearchAndNotifications) return;
    if (unreadInFlightRef.current) return;
    unreadInFlightRef.current = true;
    unreadAbortRef.current?.abort();
    const controller = new AbortController();
    unreadAbortRef.current = controller;
    try {
      const res = await fetch("/api/notifications?take=1", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // ignore
    } finally {
      unreadInFlightRef.current = false;
    }
  }, [hideSearchAndNotifications]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // refresh every 60s
    return () => {
      clearInterval(interval);
      unreadAbortRef.current?.abort();
      unreadAbortRef.current = null;
      unreadInFlightRef.current = false;
    };
  }, [fetchUnreadCount]);
  const displayName = (liveProfile?.name && liveProfile.name.trim())
    ? liveProfile.name
    : baseProfile.name;
  const avatarUrlRaw = (liveProfile?.image != null && liveProfile.image !== "")
    ? liveProfile.image
    : baseProfile.image;
  const avatarUrl =
    typeof avatarUrlRaw === "string" &&
    avatarUrlRaw.includes("/storage/v1/object/")
      ? `/api/media?url=${encodeURIComponent(avatarUrlRaw)}`
      : avatarUrlRaw;

  const refreshLiveProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.user) return;
      const user = data.user as {
        id?: string;
        name?: string;
        role?: string;
        email?: string;
        mobile?: string;
        address?: string | null;
        photoUrl?: string | null;
      };
      setLiveProfile({
        name: user.name ?? profile?.name ?? session?.user?.name ?? "User",
        subtitle: user.role ?? profile?.subtitle ?? session?.user?.role ?? "",
        image: user.photoUrl ?? profile?.image ?? session?.user?.image ?? AVATAR_URL,
        email: user.email ?? profile?.email ?? session?.user?.email ?? "",
        phone: user.mobile ?? profile?.phone ?? session?.user?.mobile ?? "",
        userId: user.id ?? profile?.userId,
        address: user.address ?? profile?.address,
        status: profile?.status,
      });
    } catch {
      // ignore
    }
  }, [
    profile?.address,
    profile?.email,
    profile?.image,
    profile?.name,
    profile?.phone,
    profile?.status,
    profile?.subtitle,
    profile?.userId,
    session?.user?.email,
    session?.user?.image,
    session?.user?.mobile,
    session?.user?.name,
    session?.user?.role,
  ]);

  useEffect(() => {
    setLiveProfile((prev) => ({
      ...baseProfile,
      ...prev,
      name: prev?.name?.trim() ? prev.name : baseProfile.name,
      image: prev?.image != null && prev.image !== "" ? prev.image : baseProfile.image,
    }));
    setModalProfile((prev) => prev ?? baseProfile);
  }, [baseProfile]);

  useEffect(() => {
    const onUpdated = () => {
      void refreshLiveProfile();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "timelly:profile-updated") {
        void refreshLiveProfile();
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
  }, [refreshLiveProfile]);

  const openSettings = () => {
    if (pathname?.startsWith("/frontend/pages/")) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "settings");
      router.push(`${pathname}?${params.toString()}`);
      return;
    }
    router.push("/settings");
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchSubmit = (queryValue?: string) => {
    const query = (queryValue || searchQuery).trim();
    if (!query) return;

    const currentPath = pathname || "";

    // Navigate based on current path
    if (currentPath.startsWith("/frontend/pages/parent")) {
      router.push(`/frontend/pages/parent?tab=dashboard&search=${encodeURIComponent(query)}`);
    } else if (currentPath.startsWith("/frontend/pages/teacher")) {
      router.push(`/frontend/pages/teacher?tab=dashboard&search=${encodeURIComponent(query)}`);
    } else if (currentPath.startsWith("/frontend/pages/schooladmin")) {
      router.push(`/frontend/pages/schooladmin?tab=students&search=${encodeURIComponent(query)}`);
    } else {
      // Default: navigate to current page with search query
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("search", query);
      router.push(`${currentPath}?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputValue = (e.target as HTMLInputElement).value;
      handleSearchSubmit(inputValue);
    }
  };

  useEffect(() => {
    if (!showProfile) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/user/me", { credentials: "include" });
        const data = await res.json();
        if (cancelled || !res.ok || !data?.user) return;

        const user = data.user as {
          id?: string;
          name?: string;
          photoUrl?: string | null;
          role?: string;
          email?: string;
          mobile?: string;
          address?: string | null;
        };

        let address = user.address ?? profile?.address ?? undefined;
        const role = user.role ?? profile?.subtitle ?? session?.user?.role ?? "";
        if (!address && role === "STUDENT") {
          try {
            const parentRes = await fetch("/api/student/parent-details", { credentials: "include" });
            const parentData = await parentRes.json();
            if (parentRes.ok && parentData?.address) {
              address = parentData.address;
            }
          } catch {
            // keep fallback
          }
        }

        setModalProfile({
          name: user.name ?? liveProfile?.name ?? profile?.name ?? session?.user?.name ?? "User",
          subtitle: profile?.subtitle ?? role,
          image: user.photoUrl ?? liveProfile?.image ?? profile?.image ?? session?.user?.image ?? AVATAR_URL,
          email: user.email ?? liveProfile?.email ?? profile?.email ?? session?.user?.email ?? "",
          phone: user.mobile ?? liveProfile?.phone ?? profile?.phone ?? session?.user?.mobile ?? "",
          userId: user.id ?? liveProfile?.userId ?? profile?.userId,
          address: address ?? liveProfile?.address,
          status: profile?.status,
        });
      } catch {
        setModalProfile(liveProfile ?? profile);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    showProfile,
    liveProfile,
    profile,
    session?.user?.email,
    session?.user?.image,
    session?.user?.mobile,
    session?.user?.name,
    session?.user?.role,
  ]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 gap-2">

          {/* LEFT */}
          <div className="min-w-0 flex-1">
            <SectionHeader title={title} />
            <p className="text-xs pl-1.5 text-white/60 hidden md:block">
              Welcome back, {displayName.split(" ")[0]}
            </p>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">

            {/* SEARCH - hidden for Super Admin */}
            {!hideSearchAndNotifications && (
              <>
                {/* <div className="hidden md:block">
                  <SearchInput 
                    showSearchIcon 
                    icon={Search}
                    iconClickable={true}
                    onIconClick={() => handleSearchSubmit(searchQuery)}
                    value={searchQuery}
                    onChange={handleSearch}
                    onKeyDown={handleKeyDown}
                    placeholder="Search..."
                    className="w-[200px] md:w-[250px]"
                  />
                </div> */}
                <button
                  className="md:hidden p-2 rounded-lg hover:bg-white/10"
                  onClick={() => setShowSearch(true)}
                >
                  <Search className="text-white"/>
                </button>
              </>
            )}

            {/* NOTIFICATIONS - hidden for Super Admin */}
            {!hideSearchAndNotifications && (
              <button
                onClick={() => {
                  setShowNotifications(true);
                  fetchUnreadCount();
                }}
                className="relative p-2 rounded-lg hover:bg-white/10"
              >
                <Bell className="text-white" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-[10px] font-bold text-white rounded-full">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            )}

            {/* SETTINGS - hidden only on Super Admin panel */}
            {!isSuperAdminPanel && (
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-white/10"
                onClick={openSettings}
                title="Settings"
              >
                <Settings className="text-white" />
              </button>
            )}

            {/* PROFILE - always show */}
            <button
              type="button"
              onClick={() => {
                setShowProfile(true);
              }}
              className="p-1 rounded-xl bg-white/5 hover:bg-white/10 flex-shrink-0 transition"
              title="My profile"
            >
              <img
                src={avatarUrl}
                alt="Profile"
                className="w-9 h-9 rounded-lg border border-white/10 object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = AVATAR_URL;
                }}
              />
            </button>
          </div>
        </div>
      </header>

      {/* PANELS */}
      {showNotifications && (
        <NotificationPanel
          onClose={() => {
            setShowNotifications(false);
            fetchUnreadCount();
          }}
        />
      )}

      {showProfile && (
        <ProfileModal
          profile={modalProfile ? {
            name: modalProfile.name,
            image: modalProfile.image,
            role: modalProfile.subtitle,
            email: modalProfile.email,
            phone: modalProfile.phone,
            userId: modalProfile.userId,
            address: modalProfile.address,
            status: modalProfile.status,
          } : undefined}
          onClose={() => setShowProfile(false)}
          onOpenSettings={() => {
            setShowProfile(false);
            openSettings();
          }}
        />
      )}

      {/* MOBILE SEARCH PLACEHOLDER - only when search is shown */}
      {!hideSearchAndNotifications && showSearch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start p-4 md:hidden">
          <div className="w-full bg-neutral-900 rounded-xl p-4">
            <SearchInput 
              icon={Search} 
              showSearchIcon
              value={searchQuery}
              onChange={handleSearch}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  handleSearchSubmit(searchQuery);
                  setShowSearch(false);
                }}
                className="px-4 py-2 bg-lime-400 text-black rounded-lg text-sm font-medium"
              >
                Search
              </button>
              <button
                onClick={() => setShowSearch(false)}
                className="px-4 py-2 text-sm text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
