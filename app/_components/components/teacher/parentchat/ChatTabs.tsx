type Status = "approved" | "pending" | "rejected";

type Props = {
  activeTab: "all" | Status;
  onChange: (tab: "all" | Status) => void;
};

export default function ChatTabs({ activeTab, onChange }: Props) {
  return (
    <div className="p-3 flex gap-2 overflow-x-auto border-b border-white/10">
      {(["all", "approved", "pending", "rejected"] as const).map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition
            ${
              activeTab === tab
                ? "bg-lime-500 text-black"
                : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
            }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
