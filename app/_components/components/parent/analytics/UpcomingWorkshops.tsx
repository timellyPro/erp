import { CalendarDays, ChevronRight, Clock3, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";

interface Workshop {
  id: string;
  title: string;
  teacher: string;
  dateLabel: string;
  timeLabel: string;
  seatsLabel: string;
  mode: string;
  image: string;
}

interface UpcomingWorkshopsProps {
  workshops: Workshop[];
}

const glass =
  "rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-5 sm:p-6";

export default function UpcomingWorkshops({ workshops }: UpcomingWorkshopsProps) {
  const router = useRouter();
  const openWorkshopsTab = () => {
    router.push("/parent?tab=workshops");
  };

  return (
    <div className={glass}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-3xl font-semibold">Upcoming Workshops</h3>
          <p className="text-sm text-white/60">Enhance skills with expert-led sessions</p>
        </div>
        <button
          type="button"
          onClick={openWorkshopsTab}
          className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm font-semibold text-lime-300 hover:bg-lime-400/20"
        >
          View All <ChevronRight size={16} />
        </button>
      </div>

      {workshops.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {workshops.map((w) => (
            <div
              key={w.id}
              role="button"
              tabIndex={0}
              onClick={openWorkshopsTab}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openWorkshopsTab();
                }
              }}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 text-left transition hover:border-lime-400/30 cursor-pointer"
            >
              <div className="relative h-40 w-full overflow-hidden">
                <img src={w.image} alt={w.title} className="h-full w-full object-cover" />
                <span className="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white/90">
                  {w.mode}
                </span>
              </div>

              <div className="space-y-2 px-4 py-4 sm:px-5">
                <h4 className="text-2xl font-semibold text-white">{w.title}</h4>

                <p className="flex items-center gap-2 text-sm text-white/70">
                  <UserRound size={14} className="text-lime-300" /> {w.teacher}
                </p>
                <p className="flex items-center gap-2 text-sm text-white/70">
                  <CalendarDays size={14} className="text-lime-300" /> {w.dateLabel}
                </p>
                <p className="flex items-center gap-2 text-sm text-white/70">
                  <Clock3 size={14} className="text-lime-300" /> {w.timeLabel}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <p className="flex items-center gap-2 text-sm text-white/60">
                    <UsersRound size={14} className="text-lime-300" /> {w.seatsLabel}
                  </p>
                  <button className="rounded-full border border-lime-400/35 bg-lime-400/10 px-4 py-1.5 text-sm font-semibold text-lime-300 hover:bg-lime-400/20">
                    Register
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/45">
          No upcoming workshops
        </div>
      )}
    </div>
  );
}
