"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Check,
  X,
  Paperclip,
  Send,
  UserPlus,
  Phone,
  Video,
  PhoneOff,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Chat } from "./ChatList";
import TimellyLoader from "../../common/TimellyLoader";

type Message = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
};

type Props = {
  chat: Chat;
  onBack: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEndChat?: () => void;
  variant?: "teacher" | "parent";
};

export default function ChatWindow({
  chat,
  onBack,
  onApprove,
  onReject,
  onEndChat,
  variant = "teacher",
}: Props) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (chat.status !== "approved" && chat.status !== "ended") return;
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/communication/messages?appointmentId=${encodeURIComponent(
          chat.id
        )}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [chat.id, chat.status]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSend = async () => {
    const text = messageInput.trim();
    if (!text || sending || !canChat) return;
    setSending(true);
    try {
      const res = await fetch("/api/communication/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: chat.id, content: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(data?.message ?? "Failed to send");
        return;
      }
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setMessageInput("");
    } catch (e) {
      console.error("Send error:", e);
    } finally {
      setSending(false);
    }
  };

  const isPending = chat.status === "pending";
  const isRejected = chat.status === "rejected";
  const isEnded = chat.status === "ended";
  const canChat = chat.status === "approved";
  const myId = session?.user?.id ?? "";

  return (
    <div className="flex flex-col h-full w-full min-h-0">

      {/* ================= Header ================= */}
      <div className="p-3 sm:p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={onBack}
              className="lg:hidden text-white shrink-0 p-1 -m-1 touch-manipulation"
              aria-label="Back to conversations"
            >
              <ArrowLeft size={22} />
            </button>

            <img
              src={chat.avatar}
              alt={chat.parent}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0"
            />

            <div className="min-w-0">
              <p className="font-semibold text-white truncate">
                {chat.parent}
              </p>
              <p className="text-xs md:text-sm text-lime-400 truncate">
                {variant === "parent" ? `Requested for ${chat.student}` : `Parent of ${chat.student}`}
              </p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">

            {/* Voice & Video (Only if Approved and not ended) */}
            {canChat && (
              <>
                <button
                  onClick={() => alert("Starting voice call...")}
                  className="p-2 sm:p-2 rounded-full hover:bg-white/10 active:bg-white/15 text-gray-300 hover:text-white transition touch-manipulation min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                  aria-label="Voice call"
                >
                  <Phone size={20} />
                </button>

                <button
                  onClick={() => alert("Starting video call...")}
                  className="p-2 sm:p-2 rounded-full hover:bg-white/10 active:bg-white/15 text-gray-300 hover:text-white transition touch-manipulation min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                  aria-label="Video call"
                >
                  <Video size={20} />
                </button>
              </>
            )}

            {/* Approve / Reject: only teacher sees these */}
            {isPending && variant === "teacher" && (
              <>
                <button
                  onClick={onApprove}
                  className="px-3 py-2 sm:py-1.5 rounded-full bg-lime-400 text-black text-xs sm:text-sm flex items-center gap-1 touch-manipulation min-h-[44px] sm:min-h-0"
                >
                  <Check size={16} />
                  <span className="hidden sm:inline">Approve</span>
                </button>

                <button
                  onClick={onReject}
                  className="px-3 py-2 sm:py-1.5 rounded-full bg-red-500/20 text-red-400 text-xs sm:text-sm flex items-center gap-1 touch-manipulation min-h-[44px] sm:min-h-0"
                >
                  <X size={16} />
                  <span className="hidden sm:inline">Reject</span>
                </button>
              </>
            )}

            {/* End chat: only teacher can end an approved chat */}
            {canChat && variant === "teacher" && onEndChat && (
              <button
                onClick={onEndChat}
                className="px-3 py-2 sm:py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-xs sm:text-sm flex items-center gap-1 touch-manipulation min-h-[44px] sm:min-h-0"
                title="End chat"
                aria-label="End chat"
              >
                <PhoneOff size={16} />
                <span className="hidden sm:inline">End chat</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= Body ================= */}
      {isPending && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
            <UserPlus className="text-lime-400" size={28} />
          </div>

          <p className="text-lg text-white/80">
            {chat.parent} wants to connect with you
          </p>
          <p className="text-sm text-white/40 mt-2">
            Approve to start chatting
          </p>
        </div>
      )}

      {!isPending && !isRejected && (
        <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-hidden min-h-0">
          {isEnded && (
            <p className="text-center text-amber-400/90 text-sm py-2 border-b border-white/10 mb-2">
              Chat ended by the teacher. No new messages can be sent.
            </p>
          )}
          <div className="flex-1 space-y-3 overflow-y-auto">
            {loadingMessages ? (
              <div className="py-4">
                <TimellyLoader compact bare title="Loading messages" steps={["Chat"]} />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                {isEnded ? "No messages in this chat." : "No messages yet. Start the conversation."}
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.senderId === myId;
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] sm:max-w-[75%] rounded-xl p-3 text-sm ${
                      isMe
                        ? "ml-auto bg-lime-500 text-black"
                        : "bg-white/10 text-white"
                    }`}
                  >
                    {m.content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {isRejected && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          This conversation has been closed.
        </div>
      )}

      {/* ================= Input ================= */}
      {!isRejected && !isEnded && (
        <div className="p-3 sm:p-4 pb-4 border-t border-white/10 flex items-center gap-2 sm:gap-3 shrink-0">
          <button type="button" className="text-gray-400 shrink-0 p-2 -m-2 touch-manipulation" aria-label="Attach file">
            <Paperclip size={20} />
          </button>

          <input
            disabled={isPending || !canChat}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 min-w-0 bg-white/5 rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-sm outline-none text-white disabled:opacity-40"
            placeholder={
              isPending
                ? "Approve request to start chatting…"
                : "Type a message…"
            }
          />

          <button
            disabled={isPending || !canChat || sending}
            onClick={handleSend}
            className="text-lime-400 disabled:opacity-40 p-2 -m-2 touch-manipulation min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
