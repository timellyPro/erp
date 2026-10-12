import StatCard from "../../../common/statCard";
import type { StatCardConfig } from "./useParentAttendanceState";

export function AttendanceStatCardsSection({ statCards }: { statCards: StatCardConfig[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map((card) => (
        <StatCard key={card.key} className="bg-[rgba(255,255,255,0.05)] backdrop-blur-xl
         border border-[rgba(255,255,255,0.1)] border-solid rounded-2xl
          shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)] transition-all duration-300 hover:-translate-y-1
           hover:bg-[rgba(255,255,255,0.08)]
         hover:shadow-[0px_15px_20px_0px_rgba(0,0,0,0.15),0px_6px_8px_0px_rgba(0,0,0,0.15)] p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-[#A3E635]/10 rounded-lg ${card.iconBoxClass}`}>
                <card.icon className={` w-5 h-5 text-[#A3E635] ${card.iconClass}`} />
              </div>
            </div>
            <span className={`${card.badgeClass}`}>
              {card.badge}
            </span>
          </div>
           <div>
                <p className="text-xs font-medium text-white/70 mb-1 mt-3">{card.title}</p>
                <p className={`${card.valueClass}`}>{card.value}</p>
                  <p className="text-xs text-white/70">{card.footer}</p>
              </div>

        </StatCard>
      ))}
    </section>
  );
}
