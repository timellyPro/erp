const glass = "bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.4)]";

export default function BestQualities() {
  const q = [
    { l: "Leadership", v: "92%" },
    { l: "Creativity", v: "88%" },
    { l: "Discipline", v: "95%" },
    { l: "Teamwork", v: "90%" },
  ];

  return (
    <div className={`${glass} rounded-3xl p-5`}>
      <h3 className="font-semibold mb-4">Best Qualities</h3>
      <div className="grid grid-cols-2 gap-3">
        {q.map((x) => (
          <div key={x.l} className="bg-white/10 rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-lime-400">{x.v}</div>
            <div className="text-xs text-white/50">{x.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
