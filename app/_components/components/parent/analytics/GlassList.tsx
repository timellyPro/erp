import React from "react";

const glass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)]";

interface GlassListProps {
  title: string;
  children: React.ReactNode;
}

export default function GlassList({ title, children }: GlassListProps) {
  return (
    <div className={`${glass} rounded-3xl p-5 space-y-3`}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}
