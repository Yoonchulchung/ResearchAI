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
        <span className="text-xs font-semibold tracking-widest text-white/60 border border-white/20 bg-white/10 rounded-full px-3 py-1">
          {badge}
        </span>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
