"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import PageHeader from "../../common/PageHeader";
import SearchInput from "../../common/SearchInput";
import TimellyLoader from "../../common/TimellyLoader";
import ChatWindow from "./ChatWindow";
import { Chat, Status } from "./ChatList";
import {
  loadTeacherChats,
  peekTeacherChats,
  setTeacherChatsCache,
  type TeacherChatAppointment,
} from "@/lib/loadTeacherFastTabs";

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100";

const STATUS_TO_API: Record<Status, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  ended: "ENDED",
};

function mapAppointmentToChat(a: TeacherChatAppointment): Chat {
  const statusMap: Record<string, Status> = {
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
    ENDED: "ended",
  };
  const status = statusMap[a.status] ?? "pending";
  const lastMsg =
    a.messages?.[0]?.content ?? a.note ?? "Request to connect";
  return {
    id: a.id,
    parent: a.student?.fatherName ?? "Parent",
    student: a.student?.user?.name ?? "Student",
    lastMessage: lastMsg,
    status,
    avatar: a.student?.user?.photoUrl ?? DEFAULT_AVATAR,
  };
}

export default function TeacherParentChatTab() {
  const initial = peekTeacherChats();
  const [activeTab, setActiveTab] = useState<"all" | Status>("all");
  const [appointments, setAppointments] = useState<TeacherChatAppointment[]>(
    () => initial ?? []
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState<string | null>(null);

  const chats = useMemo(
    () => appointments.map(mapAppointmentToChat),
    [appointments]
  );

  const applyAppointments = useCallback((list: TeacherChatAppointment[]) => {
    setAppointments(list);
    setTeacherChatsCache(list);
  }, []);

  const fetchChats = useCallback(
    async (revalidate = false) => {
      if (!revalidate) {
        const cached = peekTeacherChats();
        if (cached) {
          setAppointments(cached);
          setLoading(false);
          void fetchChats(true);
          return;
        }
      }

      try {
        setError(null);
        setLoading((prev) => (appointments.length === 0 ? true : prev));
        const list = await loadTeacherChats({ revalidate: true });
        applyAppointments(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load chats");
        if (appointments.length === 0) setAppointments([]);
      } finally {
        setLoading(false);
      }
    },
    [applyAppointments, appointments.length]
  );

  useEffect(() => {
    void fetchChats(false);
  }, [fetchChats]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  const filteredChats =
    activeTab === "all" ? chats : chats.filter((c) => c.status === activeTab);

  const patchStatus = (id: string, status: Status) => {
    setAppointments((prev) => {
      const next = prev.map((a) =>
        a.id === id ? { ...a, status: STATUS_TO_API[status] } : a
      );
      setTeacherChatsCache(next);
      return next;
    });
  };

  const updateStatus = async (id: string, status: Status) => {
    const prev = appointments;
    patchStatus(id, status);
    const action = status === "approved" ? "approve" : "reject";
    try {
      const res = await fetch(`/api/communication/appointments/${id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        applyAppointments(prev);
        setError(data?.message ?? `Failed to ${action}`);
        return;
      }
      void loadTeacherChats({ revalidate: true })
        .then((list) => applyAppointments(list))
        .catch(() => {});
    } catch {
      applyAppointments(prev);
      setError(`Failed to ${action}`);
    }
  };

  const endChat = async (id: string) => {
    const prev = appointments;
    patchStatus(id, "ended");
    try {
      const res = await fetch(`/api/communication/appointments/${id}/end`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        applyAppointments(prev);
        setError(data?.message ?? "Failed to end chat");
        return;
      }
      void loadTeacherChats({ revalidate: true })
        .then((list) => applyAppointments(list))
        .catch(() => {});
    } catch {
      applyAppointments(prev);
      setError("Failed to end chat");
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-full min-h-0 flex flex-col gap-3 sm:gap-6 px-3 sm:px-0 pb-20 lg:pb-6 overflow-hidden">
      <PageHeader
        title="Parent Communication"
        subtitle="Manage chat requests and conversations"
        compact
      />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] flex-1 min-h-0 gap-3 sm:gap-6 overflow-hidden">
        {/* ================= Sidebar ================= */}
        <div
          className={`glass-card rounded-xl sm:rounded-2xl flex flex-col overflow-hidden min-h-0
          ${activeChat ? "hidden lg:flex" : "flex"}
          w-full min-h-[280px] lg:min-h-0`}
        >
          {/* Tabs */}
          <div className="p-3 sm:p-4 flex gap-2 border-b border-white/10 -mb-px overflow-x-auto no-scrollbar">
            {(["all", "approved", "pending", "rejected", "ended"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-xs capitalize whitespace-nowrap shrink-0 min-h-[40px] sm:min-h-0 touch-manipulation
                    ${activeTab === tab
                      ? "bg-lime-500 text-black"
                      : "bg-white/5 text-gray-400 hover:bg-white/10 active:bg-white/15"
                    }`}
                >
                  {tab}
                </button>
              )
            )}
          </div>

          {/* Search */}
          <div className="p-3 sm:p-4 border-b border-white/10 shrink-0">
            <SearchInput icon={Search} placeholder="Search conversations..." />
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 space-y-1 sm:space-y-2 overscroll-contain">
            {loading && appointments.length === 0 ? (
              <div className="p-2">
                <TimellyLoader
                  compact
                  bare
                  title="Loading chats"
                  steps={["Requests", "Messages"]}
                />
              </div>
            ) : error && appointments.length === 0 ? (
              <div className="p-4 text-center text-red-400 text-sm">
                {error}
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                No conversations
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className="w-full p-2.5 sm:p-3 rounded-xl flex gap-2 sm:gap-3 bg-white/5 hover:bg-white/10 active:bg-white/15 transition text-left touch-manipulation"
                >
                  <img
                    src={chat.avatar}
                    alt={chat.parent}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white truncate">
                      {chat.parent}
                    </p>
                    <p className="text-xs text-lime-400 truncate">
                      Parent of {chat.student}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {chat.lastMessage}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ================= Chat Window ================= */}
        <div
          className={`min-w-0 min-h-[300px] sm:min-h-0 glass-card rounded-xl sm:rounded-2xl overflow-hidden flex flex-col
          ${activeChat ? "flex" : "hidden lg:flex"}`}
        >
          {activeChat ? (
            <ChatWindow
              chat={activeChat}
              onBack={() => setActiveChatId(null)}
              onApprove={() => updateStatus(activeChat.id, "approved")}
              onReject={() => updateStatus(activeChat.id, "rejected")}
              onEndChat={() => endChat(activeChat.id)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
