export interface PromptField {
  label: string;
  hint?: string;
  rows?: number;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}

export function PromptEditorModal({
  title,
  fields,
  onClose,
}: {
  title: string;
  fields: PromptField[];
  onClose: () => void;
}) {
  const isModified = fields.some((f) => f.value !== f.defaultValue);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-16">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800">{title}</span>
            {isModified && (
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                수정됨 — 테스트에 반영
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isModified && (
              <button
                onClick={() => fields.forEach((f) => f.onChange(f.defaultValue))}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                전체 초기화
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {fields.map((field) => (
            <div key={field.label}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {field.label}
                </label>
                {field.value !== field.defaultValue && (
                  <button
                    onClick={() => field.onChange(field.defaultValue)}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    초기화
                  </button>
                )}
              </div>
              {field.hint && (
                <p className="text-xs text-slate-400 mb-1.5">{field.hint}</p>
              )}
              <textarea
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                rows={field.rows ?? 8}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-y"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
