"use client";

import { Bell, Search, Settings } from "lucide-react";
import SectionHeader from "./SectionHeader";
import NotificationPanel from "./NotificationPanel";
import ProfileModal from "./ProfileModal";
import { AVATAR_URL } from "../../constants/images";
import { useAppHeaderState, AppHeaderMobileSearch } from "./shared/app-header";

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
  const {
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
  } = useAppHeaderState({ profile, hideSearchAndNotifications });

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
              <button
                className="md:hidden p-2 rounded-lg hover:bg-white/10"
                onClick={() => setShowSearch(true)}
              >
                <Search className="text-white"/>
              </button>
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
          parentPortal={Boolean(pathname?.includes("/parent"))}
          onSnapshot={onNotificationSnapshot}
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
        <AppHeaderMobileSearch
          searchQuery={searchQuery}
          onChange={handleSearch}
          onKeyDown={handleKeyDown}
          onSubmit={() => {
            handleSearchSubmit(searchQuery);
            setShowSearch(false);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </>
  );
}
