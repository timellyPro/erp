import { Chat } from "./ChatList";
import ChatWindow from "./ChatWindow";

type Props = {
  activeChat: Chat | null;
  onBack: () => void;
  onApprove: () => void;
  onReject: () => void;
};

export default function ChatPanel({
  activeChat,
  onBack,
  onApprove,
  onReject,
}: Props) {
  return (
    <div
      className={`flex-1 glass-card rounded-2xl overflow-hidden
        ${activeChat ? "flex" : "hidden lg:flex"}`}
    >
      {activeChat ? (
        <ChatWindow
          chat={activeChat}
          onBack={onBack}
          onApprove={onApprove}
          onReject={onReject}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Select a conversation
        </div>
      )}
    </div>
  );
}
