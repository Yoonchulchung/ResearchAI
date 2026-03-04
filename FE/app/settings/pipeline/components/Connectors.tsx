export function VConnector() {
  return (
    <div className="flex justify-center py-1">
      <div className="w-px h-8 bg-slate-200" />
    </div>
  );
}

export function FanOut({ count = 4 }: { count?: number }) {
  const positions = [12.5, 37.5, 62.5, 87.5].slice(0, count);
  return (
    <div className="relative h-10">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 h-5 w-px bg-slate-200" />
      <div className="absolute top-5 h-px bg-slate-200" style={{ left: `${positions[0]}%`, right: `${100 - positions[positions.length - 1]}%` }} />
      {positions.map((pct) => (
        <div key={pct} className="absolute top-5 bottom-0 w-px bg-slate-200" style={{ left: `${pct}%`, transform: "translateX(-50%)" }} />
      ))}
    </div>
  );
}

export function FanIn({ count = 4 }: { count?: number }) {
  const positions = [12.5, 37.5, 62.5, 87.5].slice(0, count);
  return (
    <div className="relative h-10">
      {positions.map((pct) => (
        <div key={pct} className="absolute top-0 h-5 w-px bg-slate-200" style={{ left: `${pct}%`, transform: "translateX(-50%)" }} />
      ))}
      <div className="absolute top-5 h-px bg-slate-200" style={{ left: `${positions[0]}%`, right: `${100 - positions[positions.length - 1]}%` }} />
      <div className="absolute left-1/2 -translate-x-1/2 top-5 bottom-0 w-px bg-slate-200" />
    </div>
  );
}
