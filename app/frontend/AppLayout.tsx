"use client";

import { useState } from "react";
import { SidebarItem } from "./types/sidebar";
import AppSidebar from "./components/common/Sidebar";
import AppHeader from "./components/common/AppHeader";
import MobileMoreOptions from "./components/mobilescreens/MobileMoreOptions";
import BottomNavBar from "./components/mobilescreens/BottomNavbar";
import { ToastProvider } from "./context/ToastContext";
import DeleteConfirmation from "./components/common/DeleteConfirmation";
import { signOut } from "next-auth/react";

type Props = {
  title: string;
  menuItems: SidebarItem[];
  profile: {
    name: string;
    subtitle?: string;
    image?: string | null;
    email?: string;
    phone?: string;
    userId?: string;
    address?: string;
    status?: string;
  };
  activeTab: string;
  children?: React.ReactNode;
  /** When true, header hides search and notification (e.g. for Super Admin) */
  hideSearchAndNotifications?: boolean;
  /** When true, shows Switch accounts in sidebar (student portal) */
  enableSwitchAccounts?: boolean;
};

export default function AppLayout({
  title,
  menuItems,
  profile,
  activeTab,
  children,
  hideSearchAndNotifications = false,
  enableSwitchAccounts = false,
}: Props) {
  const [showMore, setShowMore] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  return (
    <ToastProvider>
      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* DESKTOP SIDEBAR - profile from layout (sidebar + header show same) */}
        <aside className="hidden lg:block shrink-0">
          <AppSidebar
            menuItems={menuItems}
            profile={profile}
            activeTab={activeTab}
            onLogoutRequest={() => setShowLogoutConfirm(true)}
            enableSwitchAccounts={enableSwitchAccounts}
          />
        </aside>

        {/* MAIN */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-16 xl:pb-0">
          <AppHeader
            title={title}
            profile={profile}
            hideSearchAndNotifications={hideSearchAndNotifications}
          />

          <main className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-auto px-3 py-3 sm:p-4 md:p-6 [scrollbar-gutter:stable]">
            {children}
          </main>
        </div>

        {/* MOBILE BOTTOM NAV */}
        <BottomNavBar
          menuItems={menuItems}
          activeTab={activeTab}
          onMoreClick={() => setShowMore(true)}
        />

        {/* MORE OPTIONS SHEET */}
        {showMore && (
          <MobileMoreOptions
            items={menuItems}
            onClose={() => setShowMore(false)}
            onLogoutRequest={() => setShowLogoutConfirm(true)}
          />
        )}

        <DeleteConfirmation
          isOpen={showLogoutConfirm}
          userName={profile?.name}
          title="Confirm Logout"
          message="Are you sure you want to logout?"
          confirmLabel="Logout"
          cancelLabel="Cancel"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={async () => {
            await signOut({ callbackUrl: "/" });
            setShowLogoutConfirm(false);
          }}
        />
      </div>
    </ToastProvider>
  );
}
