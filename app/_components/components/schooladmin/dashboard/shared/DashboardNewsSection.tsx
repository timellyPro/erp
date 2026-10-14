import type { SchoolDashboardPayload } from "@/lib/school/loadSchoolDashboard";
import { formatTimeAgo } from "./formatTimeAgo";

export function DashboardNewsSection({
  latestNews,
  onViewAll,
}: {
  latestNews: SchoolDashboardPayload["latestNews"] | undefined;
  onViewAll: () => void;
}) {
  if (!latestNews || latestNews.length === 0) return null;

  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-5 sm:p-6 md:p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-bold text-white">Latest News</h3>
          <p className="text-gray-400 text-sm mt-0.5">Recent announcements and updates</p>
        </div>
        <button
          onClick={onViewAll}
          className="rounded-xl bg-lime-400 px-4 sm:px-5 py-2.5 text-sm font-bold text-black hover:bg-lime-300 transition-colors inline-flex items-center gap-1 min-h-[44px] touch-manipulation"
        >
          View All <span>→</span>
        </button>
      </div>
      <div className="space-y-6">
        {latestNews.map((n) => (
          <div key={n.id} className="pb-6 border-b border-white/5 last:border-0 last:pb-0">
            <h4 className="text-base font-bold text-white">{n.title}</h4>
            <p className="text-sm text-gray-400 mt-1">{n.description}</p>
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-gray-500">Posted by {n.postedBy}</span>
              <span className="text-xs text-gray-500">{formatTimeAgo(n.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
