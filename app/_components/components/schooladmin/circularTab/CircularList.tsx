import { CircularRow } from "./types";
import CircularCard from "./circularCard";

export default function CircularList({
  circulars,
}: {
  circulars: CircularRow[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full min-w-0 pb-2">
      {circulars.map((c) => (
        <CircularCard key={c.id} c={c} />
      ))}
    </div>
  );
}
