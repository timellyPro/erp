"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { SidebarItem } from "../../types/sidebar";
import { PRIMARY_COLOR } from "../../constants/colors";
import { useSession } from "next-auth/react";
import { useAllowedFeatures } from "@/lib/auth/usePermissions";

export default function MobileMoreOptions({
  items,
  onClose,
  onLogoutRequest,
}: {
  items: SidebarItem[];
  onClose: () => void;
  onLogoutRequest?: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const { data: session } = useSession();
  const allowed = useAllowedFeatures();

  const filtered = (items || []).filter((item) => {
    if (!item.tab && !item.permission) return true;
    if (!session || !session.user) return true;
    if (session.user.role !== "TEACHER") return true;
    if (!allowed || allowed.length === 0) return true;

    const allowedNormalized = (allowed || []).map((a) => String(a).toLowerCase());
    const tabKey = item.tab ? item.tab.toLowerCase() : null;
    const permKey = item.permission ? String(item.permission).toLowerCase() : null;

    if (tabKey && allowedNormalized.includes(tabKey)) return true;
    if (permKey && allowedNormalized.includes(permKey)) return true;
    if (tabKey && allowedNormalized.some(a => a.startsWith(tabKey))) return true;
    return false;
  });

  const tabItems = filtered.filter(item => item.tab);
  const logoutItem = filtered.find(item => item.action === "logout");

  // Only show items NOT already in the bottom bar (first 4 tabs)
  const moreOnlyItems = tabItems.slice(4);

  const handleItemClick = async (item: SidebarItem) => {
    if (item.action === "logout") {
      if (onLogoutRequest) {
        onLogoutRequest();
        onClose();
        return;
      }
      await signOut({ callbackUrl: "/admin/login" });
      return;
    }
    if (item.href) {
      router.push(item.href);
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="
        fixed inset-x-0 bottom-0 z-50 min-[1100px]:hidden
        bg-gradient-to-br from-[#0b1220] to-[#1a2332]/95
        backdrop-blur-xl
        rounded-t-3xl
        border-t border-white/10
        p-6 max-h-[80vh] overflow-y-auto no-scrollbar
      "
    >
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-white font-semibold text-lg">
          More Options
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
        >
          <X size={20} />
        </button>
      </div>

      {/* GRID - only items not already shown in bottom nav */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {moreOnlyItems.map(item => {
          const Icon = item.icon;
          const isSettings = item.tab === "settings";

          return (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleItemClick(item)}
              className={`
                flex flex-col items-center justify-center
                gap-2 p-4 rounded-xl
                transition-all
                ${isSettings
                  ? "bg-lime-500/10 border border-lime-500/30"
                  : "bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20"
                }
              `}
            >
              <Icon size={24} style={{ color: PRIMARY_COLOR }} />

              {/* FIXED TEXT */}
              <span
                className="
                  text-xs text-white/70
                  text-center
                  leading-snug
                  break-words
                  whitespace-normal
                "
              >
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* LOGOUT - Always show */}
      {logoutItem && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => handleItemClick(logoutItem)}
          className="
            w-full py-3
            bg-red-500/10 hover:bg-red-500/20
            border border-red-500/30
            rounded-xl
            text-red-400 font-medium
            flex items-center justify-center gap-2
          "
        >
          <logoutItem.icon size={18} />
          {logoutItem.label}
        </motion.button>
      )}
    </motion.div>
  );
}
