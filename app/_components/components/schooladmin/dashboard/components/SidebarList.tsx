import { Calendar, FileText, DollarSign, Bell, Award } from "lucide-react";

interface ListItemProps {
  title: string;
  subtitle: string;
  meta?: string;
  status?: "Approved" | "Pending" | "Confirmed" | "Scheduled";
  type?: "activity" | "teacher" | "workshop";
  activityType?: "certificate" | "leave" | "fee" | "news";
}

const ActivityIcon = ({ type }: { type?: string }) => {
  const cls = "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0";
  switch (type) {
    case "certificate":
      return <div className={`${cls} bg-purple-500/20`}><Award className="w-5 h-5 text-purple-400" /></div>;
    case "leave":
      return <div className={`${cls} bg-amber-500/20`}><FileText className="w-5 h-5 text-amber-400" /></div>;
    case "fee":
      return <div className={`${cls} bg-lime-500/20`}><DollarSign className="w-5 h-5 text-lime-400" /></div>;
    case "news":
      return <div className={`${cls} bg-blue-500/20`}><Bell className="w-5 h-5 text-blue-400" /></div>;
    default:
      return <div className={`${cls} bg-white/5 border border-white/10`}><FileText className="w-5 h-5 text-gray-400" /></div>;
  }
};

export const SidebarList = ({
  title,
  items,
  subtitle,
  showViewAll = true,
  onViewAllClick
}: {
  title: string;
  items: ListItemProps[];
  subtitle?: string;
  showViewAll?: boolean;
  onViewAllClick?:()=>void
}) => (
  <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-4 sm:p-6 md:p-8">
    <div className="flex justify-between items-start gap-4 mb-4 sm:mb-6">
      <div>
        <h3 className="font-bold text-xl text-white">{title}</h3>
        {subtitle && <p className="text-gray-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
      {showViewAll && (
        <button onClick={onViewAllClick} className="text-lime-400 text-xs font-bold hover:text-white transition-colors py-2 px-3 min-h-[44px] touch-manipulation -my-1">
          View All
        </button>
      )}
    </div>
    <div className="space-y-0">
      {items.map((item, idx) => (
        <div key={idx} className="flex justify-between items-center py-4 sm:py-5 border-b border-white/5 last:border-0 gap-3">
          <div className="flex gap-4 items-center min-w-0">
            {item.type === "workshop" && (
              <div className="w-10 h-10 rounded-full bg-lime-500/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-lime-400" />
              </div>
            )}
            {item.type === "activity" && <ActivityIcon type={item.activityType} />}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-100">{item.title}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{item.subtitle}</p>
              {item.meta && <p className="text-[11px] text-gray-500 mt-1.5">{item.meta}</p>}
            </div>
          </div>
          {item.status && (
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${
              item.status === "Approved" || item.status === "Confirmed"
                ? "bg-lime-400/20 text-lime-400"
                : item.status === "Pending"
                  ? "bg-amber-400/20 text-amber-400"
                  : "bg-white/10 text-white/70"
            }`}>
              {item.status}
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
);