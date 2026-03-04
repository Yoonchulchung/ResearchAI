export function PromptEditButton({
  modified,
  active,
  onClick,
}: {
  modified: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
        active ? "bg-orange-100 text-orange-600" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
      } ${modified ? "ring-1 ring-orange-300" : ""}`}
    >
      ✏️ 프롬프트
    </button>
  );
}
