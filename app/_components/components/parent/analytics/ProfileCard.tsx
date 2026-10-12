import { Trophy } from "lucide-react";

const glass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)]";

interface ProfileCardProps {
  name: string;
  class: string;
  rollNo: string;
  photoUrl: string | null;
  grade: string;
  score: number;
  rank: number | null;
}

export default function ProfileCard({
  name,
  class: className,
  rollNo,
  photoUrl,
  grade,
  score,
  rank,
}: ProfileCardProps) {
  const avatarUrl = photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

  return (
    <div className={`${glass} rounded-3xl overflow-hidden`}>
      <div className="p-5 bg-yellow-400/10">
        <span className="text-xs text-yellow-400">★ Star Student</span>
        <h2 className="text-xl font-bold mt-1">{name}</h2>
        <p className="text-white/50 text-sm">{className} • Roll {rollNo || "—"}</p>
      </div>
      <img
        src={avatarUrl}
        alt={name}
        className="w-full h-48 object-cover bg-black/40"
      />
      <div className="p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-white/60">Overall Performance</span>
          <Trophy className="text-yellow-400" size={16} />
        </div>
        <div className="text-green-400 text-2xl font-bold">{grade} {score.toFixed(1)}%</div>
        <div className="w-full h-2 bg-white/10 rounded mt-2">
          <div className="h-full bg-lime-400 rounded" style={{ width: `${Math.min(score, 100)}%` }} />
        </div>
        {rank && <p className="text-xs text-white/40 mt-2">Rank #{rank}</p>}
      </div>
    </div>
  );
}
