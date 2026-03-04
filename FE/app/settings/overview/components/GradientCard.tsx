export function GradientCard({
  badge,
  gradient,
  blob,
  children,
}: {
  badge: string;
  gradient: string;
  blob: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      <div className="absolute inset-0" style={{ background: gradient }} />
      <div className="absolute inset-0 opacity-35" style={{ background: blob }} />
      <div className="relative px-8 py-8">
        <span className="text-[11px] font-semibold tracking-widest text-slate-500 border border-slate-300/70 bg-white/50 rounded-full px-3 py-1">
          {badge}
        </span>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
