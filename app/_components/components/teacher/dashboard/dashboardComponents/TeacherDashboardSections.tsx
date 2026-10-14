"use client";

import {
  ArrowRight,
  Bell,
  BookOpen,
  Calendar,
  MessageCircle,
  Users,
} from "lucide-react";
import StatCard from "../../../common/statCard";
import { formatNumber } from "../../../../utils/format";
import { TeacherDashboardData } from "./types";
import CircularNoticeCard from "../../../common/CircularNoticeCard";
import TeacherDashboardSideColumn from "./TeacherDashboardSideColumn";

const STATUS_COLORS = ["bg-red-500", "bg-yellow-400", "bg-blue-500"];

function formatEventDate(value?: string | null) {
  if (!value) return "TBD";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatEventTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface DashboardContentProps {
  data: TeacherDashboardData;
  onManageClasses: () => void;
  onOpenChat: () => void;
}

export function TeacherDashboardContent({
  data,
  onManageClasses,
  onOpenChat,
}: DashboardContentProps) {
  const stats = data.stats;
  const statCards = [
    {
      title: "Total Classes",
      value: stats.totalClasses,
      subtitle: `${formatNumber(stats.totalStudents)} total students`,
      icon: <Users size={20} className="w-5 h-5 text-lime-400" />,
      badge: {
        label: "ACTIVE",
        className:
          "bg-lime-400/10 text-lime-400 border border-lime-400/20",
      },
    },
    {
      title: "Total Students",
      value: formatNumber(stats.totalStudents),
      subtitle: "Across all classes",
      icon: <BookOpen size={20} className="w-5 h-5 text-lime-400" />,
      badge: {
        label: "TOTAL",
        className: "bg-white/5 text-gray-400 border border-white/10",
      },
    },
    {
      title: "Pending Chats",
      value: stats.pendingChats,
      subtitle: "Parent messages",
      icon: <MessageCircle size={20} className="w-5 h-5 text-lime-400" />,
      badge: {
        label: "ACTION",
        className: "bg-red-500/10 text-red-400 border border-red-500/20",
      },
    },
    {
      title: "Unread Alerts",
      value: stats.unreadAlerts,
      subtitle: "Important updates",
      icon: <Bell size={20} className="w-5 h-5 text-lime-400" />,
      badge: {
        label: "NEW",
        className: "bg-red-500/10 text-red-400 border border-red-500/20",
      },
    },
  ];
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard key={card.title} className="bg-white/5">
            <div className="flex items-start justify-between">
              <div className="p-3 bg-white/5 rounded-xl group-hover:bg-lime-400/20 transition-colors">
                {card.icon}
              </div>
              <span
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg ${card.badge.className}`}
              >
                {card.badge.label}
              </span>
            </div>
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-400 mb-1">{card.title}</h3>
              <p className="text-3xl font-bold text-white mb-1">{card.value}</p>
              <p className="text-xs text-gray-500">{card.subtitle}</p>
            </div>
          </StatCard>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-1.5 h-6 bg-lime-400 rounded-full" />
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">Circulars & Notices</h3>
            <p className="text-sm text-gray-400 mt-1">Create and manage school-wide circulars</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {data.circulars.map((c, index) => (
            <CircularNoticeCard
              key={c.id}
              referenceNumber={c.referenceNumber}
              subject={c.subject}
              content={c.content}
              publishStatus={c.publishStatus}
              date={c.date}
              issuedBy={c.issuedBy}
              issuedByPhoto={c.issuedByPhoto}
              attachments={c.attachments}
              accentClassName={STATUS_COLORS[index % STATUS_COLORS.length]}
            />
          ))}

          {data.circulars.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/60">
              No circulars available.
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="min-h-[500px] background-blur-2xl border border-white/10 bg-transparent rounded-2xl overflow-hidden border border-white/5 flex flex-col justify-center 
          items-center p-8 sm:p-10 text-center group hover:border-lime-400/30 transition-all">
            <div className="p-6 rounded-full bg-white/5 group-hover:bg-lime-400/10 transition-colors mb-4">
              <Users size={22} className="lucide lucide-users w-10 h-10 text-gray-400 group-hover:text-lime-400 transition-colors" />
            </div>
            <h3 className="font-bold text-white text-2xl mb-2">Classes Handling</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
              You are currently handling{" "}
              <span className="text-lime-400 font-bold">{stats.totalClasses} classes</span>. Manage your
              schedule, students, and subjects from the detailed view.
            </p>
            <button
              type="button"
              onClick={onManageClasses}
              className="px-8 py-3 bg-lime-400 text-black font-bold rounded-xl hover:bg-lime-500 
              transition-all shadow-[0_0_20px_rgba(163,230,53,0.3)] flex items-center gap-2"
            >
              Manage Classes
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="min-h-[500px] rounded-2xl border border-white/10 bg-white/5 p-6 rounded-2xl overflow-hidden border border-white/5 flex flex-col overflow-y-auto no-scrollbar scrollbar-thumb-white/10">
            <h3 className="text-xl font-semibold text-white">Upcoming Events</h3>
            <p className="text-sm text-white/60 mt-1">Meetings, workshops & deadlines</p>

            <div className="mt-4 space-y-3 divide-y divide-white/5">
              {data.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3 hover:bg-white/5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/5 rounded-xl text-gray-400 group-hover:bg-lime-400/10
                     group-hover:text-lime-400 transition-all border border-white/5">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-200 text-sm group-hover:text-white">{event.title}</h3>
                      <p className="text-xs text-gray-400">
                        {formatEventDate(event.eventDate)}
                        {formatEventTime(event.eventDate) ? (
                          <span className="mx-2 text-gray-500">•</span>
                        ) : null}
                        {formatEventTime(event.eventDate)}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-white/5 text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-white/10
                   group-hover:border-lime-400/20 group-hover:text-lime-400 transition-colors">
                    {event.type}
                  </span>
                </div>
              ))}
              {data.events.length === 0 && (
                <div className="text-sm text-white/60">No upcoming events.</div>
              )}
            </div>
          </div>
        </div>

        <TeacherDashboardSideColumn
          notifications={data.notifications ?? []}
          recentChats={data.recentChats ?? []}
          onOpenChat={onOpenChat}
        />
      </section>
    </>
  );
}
