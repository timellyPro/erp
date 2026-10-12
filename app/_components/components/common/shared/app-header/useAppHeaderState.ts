import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AVATAR_URL } from "../../../../constants/images";
import type { HeaderProfile } from "../../AppHeader";
import {
  fetchCurrentUser,
  fetchParentDetails,
  fetchUnreadNotificationsCount,
} from "@/lib/api/appHeader";

export function useAppHeaderState({
  profile,
  hideSearchAndNotifications,
}: {
  profile?: HeaderProfile;
  hideSearchAndNotifications: boolean;
}) {
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
  const isSuperAdminPanel = pathname?.startsWith("/superadmin");
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
      const { ok, data } = await fetchUnreadNotificationsCount(controller.signal);
      if (ok && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // ignore
    } finally {
      unreadInFlightRef.current = false;
    }
  }, [hideSearchAndNotifications]);

  const onNotificationSnapshot = useCallback(({ unreadCount: n }: { unreadCount: number }) => {
    setUnreadCount(n);
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Panel open: list poll + onSnapshot refresh the badge — skip duplicate header polling
    if (showNotifications) {
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        unreadAbortRef.current?.abort();
        unreadAbortRef.current = null;
        unreadInFlightRef.current = false;
      };
    }

    const interval = setInterval(fetchUnreadCount, 30000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      unreadAbortRef.current?.abort();
      unreadAbortRef.current = null;
      unreadInFlightRef.current = false;
    };
  }, [fetchUnreadCount, showNotifications]);
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
      const { ok, data } = await fetchCurrentUser({ cache: "no-store" });
      if (!ok || !data?.user) return;
      const user = data.user;
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
    const isPortalPath = ["/parent", "/teacher", "/schooladmin", "/superadmin", "/chairman"].some(
      (prefix) => pathname?.startsWith(prefix)
    );
    if (isPortalPath) {
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
    if (currentPath.startsWith("/parent")) {
      router.push(`/parent?tab=dashboard&search=${encodeURIComponent(query)}`);
    } else if (currentPath.startsWith("/teacher")) {
      router.push(`/teacher?tab=dashboard&search=${encodeURIComponent(query)}`);
    } else if (currentPath.startsWith("/schooladmin")) {
      router.push(`/schooladmin?tab=students&search=${encodeURIComponent(query)}`);
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
        const { ok, data } = await fetchCurrentUser();
        if (cancelled || !ok || !data?.user) return;

        const user = data.user;

        let address = user.address ?? profile?.address ?? undefined;
        const role = user.role ?? profile?.subtitle ?? session?.user?.role ?? "";
        if (!address && role === "STUDENT") {
          try {
            const { ok: parentOk, data: parentData } = await fetchParentDetails();
            if (parentOk && parentData?.address) {
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

  return {
    pathname,
    showProfile,
    setShowProfile,
    showNotifications,
    setShowNotifications,
    showSearch,
    setShowSearch,
    searchQuery,
    modalProfile,
    unreadCount,
    isSuperAdminPanel,
    fetchUnreadCount,
    onNotificationSnapshot,
    displayName,
    avatarUrl,
    openSettings,
    handleSearch,
    handleSearchSubmit,
    handleKeyDown,
  };
}
