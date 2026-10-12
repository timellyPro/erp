import { TrendingUp } from "lucide-react";

const glass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)]";

export default function AnalyticsHeader() {
  return (
    <header className={`${glass} rounded-3xl p-8`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-white/10 p-2 rounded-lg">
          <TrendingUp />
        </div>
        <h1 className="text-3xl font-bold">Analytics</h1>
      </div>
      <p className="text-white/60">
        Welcome to Timelly Parent Dashboard
      </p>
    </header>
  );
}
