"use client";

import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import ChatWindow from "../../teacher/parentchat/ChatWindow";
import { Chat, Status } from "../../teacher/parentchat/ChatList";
import NewChatModal from "./NewChatModal";
import ParentTimellyLoader from "../ParentTimellyLoader";

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200";

function mapAppointmentToChat(apt: {
  id: string;
  status: string;
  note?: string | null;
  student?: {
    fatherName?: string | null;
    user?: { name: string | null; photoUrl: string | null };
  } | null;
  teacher?: { name: string | null; photoUrl: string | null; subject?: string | null } | null;
  messages?: { content: string }[];
}): Chat {
  const student = apt.student;
  const teacher = apt.teacher;
  const studentName = student?.user?.name ?? "Student";
  const lastMsg = apt.messages?.[0]?.content ?? apt.note ?? "No messages yet";
  const statusMap: Record<string, Status> = {
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    ended: "ended",
  };
  const status: Status = statusMap[apt.status.toLowerCase()] ?? "pending";
  return {
    id: apt.id,
    parent: teacher?.name ?? "Teacher",
    student: studentName,
    lastMessage: lastMsg,
    status,
    avatar: teacher?.photoUrl ?? DEFAULT_AVATAR,
  };
}

export default function TeacherParentChatTab() {
  const [activeTab, setActiveTab] = useState<"all" | Status>("all");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchAppointments = useCallback(async () => {
    if (chats.length === 0) setLoading(true);
    try {
      const res = await fetch("/api/communication/appointments", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChats([]);
        return;
      }
      const list = Array.isArray(data.appointments) ? data.appointments : [];
      setChats(list.map(mapAppointmentToChat));
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const activeChat =
    chats.find((c) => c.id === activeChatId) ?? null;

  const filteredChats =
    activeTab === "all"
      ? chats
      : chats.filter((c) => c.status === activeTab);

  const approveChat = async (id: string) => {
    try {
      const res = await fetch(`/api/communication/appointments/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "approved" as const } : c))
        );
      }
    } catch {
      // keep UI state
    }
  };

  return (
    <div
      className="flex h-[calc(100dvh-7.25rem)] max-h-[calc(100dvh-7.25rem)] min-h-0 w-full max-w-full min-w-0 flex-col overflow-x-hidden bg-gradient-to-br sm:h-auto sm:max-h-none sm:min-h-[36rem] lg:min-h-0 sm:pb-20 lg:pb-6"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden sm:flex-row sm:gap-6">

        {/* ================= Sidebar ================= */}
        <div
          className={`backdrop-blur-xl bg-white/5 border border-white/10 
          rounded-xl sm:rounded-2xl flex min-h-0 flex-1 flex-col overflow-hidden
          ${activeChat ? "hidden lg:flex" : "flex"}
          w-full min-w-0 lg:w-96 lg:flex-none lg:min-h-[280px]`}
        >

          {/* Tabs */}
          <div className="p-3 sm:p-4 flex flex-wrap gap-2 border-b border-white/10 shrink-0">
            {(["all", "approved", "pending"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-2.5 sm:px-4 py-2 sm:py-1.5 rounded-lg sm:rounded-full text-xs capitalize transition touch-manipulation shrink-0 min-h-[40px] sm:min-h-0
                    ${
                      activeTab === tab
                        ? "bg-lime-400 text-black font-semibold"
                        : "bg-white/10 text-gray-300 hover:bg-white/20 active:bg-white/25"
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 space-y-2 overscroll-contain min-h-0">
            {loading ? (
              <ParentTimellyLoader preset="chat" compact bare className="py-8" />
            ) : filteredChats.length === 0 ? (
              <div className="text-center text-gray-400 text-sm">
                No conversations
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className="flex w-full min-w-0 max-w-full gap-2 rounded-xl p-2.5 text-left touch-manipulation transition-all duration-200 sm:gap-3 sm:p-3
                  bg-white/5 hover:bg-white/15 active:bg-white/20"
                >
                  <img
                    src={chat.avatar}
                    alt={chat.parent}
                    className="h-10 w-10 shrink-0 rounded-full object-cover sm:h-12 sm:w-12"
                  />

                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold text-sm text-white">
                        {chat.parent}
                      </p>
                      {chat.status === "pending" && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] text-yellow-400">
                          Pending
                        </span>
                      )}
                    </div>

                    <p className="truncate text-xs text-lime-400">
                      Requested for {chat.student}
                    </p>

                    <p className="line-clamp-2 break-words text-xs text-gray-400">
                      {chat.lastMessage}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Bottom Button */}
          <div className="p-3 sm:p-4 border-t border-white/10 shrink-0">
            <button onClick={() => setShowModal(true)} className="w-full bg-lime-400 text-black font-semibold py-3 sm:py-2 rounded-xl hover:bg-lime-300 active:bg-lime-200 transition touch-manipulation">
              New Chat Request
            </button>
            
          </div>
        
        </div>
  {showModal && (
              <NewChatModal
                onClose={() => setShowModal(false)}
                onSuccess={fetchAppointments}
              />
            )}
        {/* ================= Chat Window ================= */}
        <div
          className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl sm:rounded-2xl
          ${activeChat
            ? "flex min-h-[calc(100dvh-7.25rem)] max-h-[calc(100dvh-7.25rem)] sm:max-h-none sm:min-h-[300px]"
            : "hidden lg:flex"}`}
        >
          {activeChat ? (
            <ChatWindow
              chat={activeChat}
              onBack={() => setActiveChatId(null)}
              onApprove={() => approveChat(activeChat.id)}
              onReject={() => {}}
              variant="parent"
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
