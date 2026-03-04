export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
        active ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-green-500" : "bg-slate-300"}`} />
      {active ? "active" : "inactive"}
    </span>
  );
}
